import logging
import threading
from tinydb import TinyDB, Query, where
import datetime
from datetime import timedelta

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
lock = threading.Lock()


class Database(object):
    def __init__(self):
        logger.debug("Initializing database...")
        self.db = TinyDB("./outbound.json")
        self.callsTable = self.db.table("pending_calls")
        self.answeredCallsTable = self.db.table("answered_calls")
        self.confTable = self.db.table("configuration")
        self.conversationsHelperTable = self.db.table("conversations_helper")

    def unify_calls_tables(self):
        logger.debug(f"In unify_calls_tables()...")
        with lock:
            currentSessionCallsTable = self.db.table(
                f'calls_started_on_{datetime.datetime.strftime(datetime.datetime.now() - timedelta(1), "%Y-%m-%d")}')
            calls = self.callsTable.all() + self.answeredCallsTable.all()
            self.callsTable.truncate()
            self.answeredCallsTable.truncate()

            logger.debug(f"unify_calls_tables --- save call history and prepare the calls to another session")
            for call in calls:
                currentSessionCallsTable.insert(call)
                # Leave just the necessary properties
                phone = call["phone"]
                metadata = call.get("metadata")
                call.clear()
                call["phone"] = phone
                call["metadata"] = metadata
                self.callsTable.insert(call)

    def get_conf_param_value(self, param):
        logger.debug(f"In get_conf_param_value({param})...")
        with lock:
            if len(self.confTable.all()) != 0:
                return self.confTable.all()[0][param]
            else:  # If conf has been deleted somehow
                raise Exception("configuration was not found..")

    def get_calls_from_db(self):
        logger.debug(f"In get_calls_from_db()...")
        calls = {}
        with lock:
            return self.callsTable.all() + self.answeredCallsTable.all()

    def get_conf_from_db(self):
        logger.debug(f"In get_conf_from_db()...")
        with lock:
            return self.confTable.all()[0] if len(self.confTable) != 0 else {}

    def update_call_by_conversation_id(self, data):
        logger.debug(f"In update_call_by_conversation_id({data})...")
        with lock:
            curr_time = datetime.datetime.now().strftime("%H:%M:%S")
            call_information = {
                "conversationId": data.get("conversationId", None),
                "status": data.get("status", None),
                "reason": data.get("reason", None),
                "reasonCode": data.get("reasonCode", None),
            }

            person = Query()
            if data.get("status", None) == "completed":  # The call has already been initiated
                call = self.answeredCallsTable.search(person.conversationId == data["conversationId"])[0]
                call_history = ([] if call.get("callHistory") is None else call.get("callHistory"))
                call_history.append({"time": curr_time, "information": call_information.copy()})
                call_information["callHistory"] = call_history

                self.answeredCallsTable.update(call_information, person.conversationId == data["conversationId"])
                return

            if data.get("status", None) == "answered":
                calls = self.callsTable.search(person.conversationId == data["conversationId"])
                if (len(calls) == 0):  # Notification has arrived before the response of the calling request(rarely..)
                    self.conversationsHelperTable.insert(data)
                else:
                    call = calls[0]
                    self.callsTable.remove((where("conversationId") == data["conversationId"]))
                    self.answeredCallsTable.insert(call)
                    call_history = ([]if call.get("callHistory") is None else call.get("callHistory"))
                    call_history.append({"time": curr_time, "information": call_information.copy()})
                    call_information["callHistory"] = call_history
                    self.answeredCallsTable.update(call_information, person.conversationId == data["conversationId"])

                return

            if data.get("status", None) == "failed":
                call = self.callsTable.search(person.conversationId == data["conversationId"])[0]
                call_history = ([] if call.get("callHistory") is None else call.get("callHistory"))
                call_history.append({"time": curr_time, "information": call_information.copy()})
                call_information["callHistory"] = call_history
                self.callsTable.update(call_information, person.conversationId == data["conversationId"])
                return

    def update_call_by_phone(self, phone, updated_params, request_is_failed=False):
        logger.debug(f"In update_call_by_phone({phone}, {updated_params})...")
        with lock:
            person = Query()

            # If notification status arrived before the calling respone...
            conv = self.conversationsHelperTable.search(person.conversationId == updated_params["conversationId"])
            if len(conv) == 1:
                updated_params.update(conv[0])
                self.conversationsHelperTable.remove(where("conversationId") == updated_params["conversationId"])

            call = self.callsTable.search(person.phone == phone)[0]
            curr_time = datetime.datetime.now().strftime("%H:%M:%S")
            if request_is_failed or updated_params.get("status"):
                call_history = ([] if call.get("callHistory") is None else call.get("callHistory"))
                call_history.append({"time": curr_time, "information": updated_params.copy()})
                updated_params["callHistory"] = call_history

            updated_params["lastCall"] = curr_time
            updated_params["tries"] = call.get("tries", 0) + 1
            # If notification status arrived before the calling respone...
            if updated_params.get("status") == "answered":
                print("11111111111111111111111111111111111111")
                self.answeredCallsTable.insert(call)
                self.answeredCallsTable.update(updated_params, person.phone == phone)
            else:
                self.callsTable.update(updated_params, person.phone == phone)

    def get_call_by_phone(self, phone):
        logger.debug(f"In get_call_by_phone({phone})...")
        with lock:
            person = Query()
            calls = self.callsTable.search(person.phone == phone)
            if len(calls) != 0:
                return calls[0]

            # Otherwise, the call already been answered
            return self.answeredCallsTable.search(person.phone == phone)[0]

    def get_table_lines(self, table):
        logger.debug(f"In get_table_lines({table})...")
        with lock:
            if table == "pending_calls":
                return self.callsTable.all()
            elif table == "answered_calls":
                return self.answeredCallsTable.all()
            elif table == "configuration":
                return self.confTable.all()
            else:
                raise Exception(f"Table {table} was not found on")

    def remove_line(self, key, value):
        # Should remove it from either the call is
        self.callsTable.remove((where(key) == value))
        self.answeredCallsTable.remove((where(key) == value))

    def remove_all_lines(self, table):
        logger.debug(f"In remove_all_lines({table})...")

        # should we use RLock?
        with lock:
            if table == "pending_calls":
                self.conversationsHelperTable.truncate()
                self.callsTable.truncate()
                return self.answeredCallsTable.truncate()
            elif table == "configuration":
                return self.confTable.truncate()
            else:
                raise Exception(f"Table {table} was not found on")

    def load_conf_to_db(self, vag_connection_data):
        logger.debug(f"In load_conf_to_db({vag_connection_data})...")

        # Should be lock here
        with lock:
            self.confTable.truncate()
            self.confTable.insert(vag_connection_data)

    def append_calls_to_db(self, calls):
        logger.debug(f"In append_calls_to_db({calls})...")

        # Should be lock here
        with lock:
            for call in calls:
                person = Query()
                if len(self.callsTable.search(person.phone == call["phone"])) == 0 and len(self.answeredCallsTable.search(person.phone == call["phone"])) == 0:
                    self.callsTable.insert(call)

    def replace_calls_in_db(self, calls):
        logger.debug(f"In replace_calls_in_db({calls})...")

        with lock:
            self.callsTable.truncate()
            self.answeredCallsTable.truncate()
            for call in calls:
                self.callsTable.insert(call)
