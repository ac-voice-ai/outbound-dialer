import logging
from logging.handlers import TimedRotatingFileHandler
from flask import Flask, request, send_file
from flask_cors import CORS
import threading
from database import Database
import json
import requests
from requests.auth import HTTPBasicAuth
import time
from datetime import datetime
import csv
import io
import socket
from zipfile import ZipFile
import os


CSV_HEAD = [
    "phone",
    "metadata",
    "conversationId",
    "lastCall",
    "callHistory",
    "tries",
    "status",
    "reason",
    "reasonCode",
]
VAG_CONNECTION_PARAMS = [
    "host",
    "clientId",
    "clientSecret",
    "start",
    "end",
    "maxRetries",
    "bot",
    "machineDetection",
    "caller",
    "retryTime",
    "concurrent"
]
CALL_PARAMS = ["phone"]
CALL_HEAD_LINES_MAP = [
    ["phone", "Phone"],
    ["metadata", "Metadata"],
    ["conversationId", "Conversation ID"],
    ["status", "Status"],
    ["reasonCode", "Reason Code"],
    ["reason", "Reason"],
    ["tries", "Number Of Attempts"],
    ["lastCall", "Last Call"],
]
CALL_ANSWERED = "answered"
DIALER_STOPPED_SLEEP_TIME = 24 * 60  # 24 hours
NO_CALLS_OR_CONF_SLEEP_TIME = 1 * 60  # 1 hour

app = Flask(__name__)
CORS(app)
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
formatter = logging.Formatter(
    "%(asctime)s | %(name)s | %(levelname)s :::::::::: %(message)s")
handler = logging.StreamHandler()
handler.setFormatter(formatter)
file_handler = TimedRotatingFileHandler("./log/log", "d", 1)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)
logger.addHandler(handler)


class Sleep(object):
    def __init__(self, seconds, immediate=True):
        self.seconds = seconds
        self.event = threading.Event()
        if immediate:
            self.sleep()

    def sleep(self, seconds=None):
        if seconds is None:
            seconds = self.seconds
        self.event.clear()
        self.event.wait(timeout=seconds)

    def wake(self):
        self.event.set()


class FlaskAppWrapper(object):
    def __init__(self, host, port):
        logger.debug(f"In FlaskAppWrapper.init({host}, {port})...")
        self.host = host
        self.port = port
        self.database = Database()
        self.sleeper = Sleep(60, False)
        self.to_unify_calls_tables = False
        self.num_of_ongoing_calls = 0
        self.dialer_is_running = False
        self.start_routine()

    def make_calls(self):
        logger.debug(f"In make_calls()...")
        sleep_time = 0
        try:
            while True:
                if sleep_time > 0:
                    logger.debug(f"make_calls --- going to sleep {sleep_time}")
                    self.sleeper.sleep(sleep_time)
                    if self.to_unify_calls_tables:
                        self.to_unify_calls_tables = False
                        logger.debug(f"make_calls --- unifying calls tables")
                        self.database.unify_calls_tables()
                    sleep_time = 0
                    continue

                if not self.dialer_is_running:
                    logger.debug(
                        f"make_calls --- dialer is not running so going to sleep...")
                    sleep_time = DIALER_STOPPED_SLEEP_TIME * 60  # Going to sleep
                    continue

                calls_table_lines = self.database.get_table_lines(
                    "pending_calls")
                conf_table_lines = self.database.get_table_lines(
                    "configuration")
                if len(calls_table_lines) == 0 or len(conf_table_lines) == 0:
                    logger.debug(
                        f"make_calls --- no calls or configuration found on database, going to sleep...")
                    sleep_time = NO_CALLS_OR_CONF_SLEEP_TIME * 60
                    continue

                conf = conf_table_lines[0]
                [start_hour_by_user,
                    start_minute_by_user] = conf["start"].split(":")
                [end_hour_by_user, end_minute_by_user] = conf["end"].split(":")
                now = datetime.now()
                hour = now.hour
                minute = now.minute

                start_time_by_user = int(
                    start_hour_by_user) * 60 + int(start_minute_by_user)
                end_time_by_user = int(end_hour_by_user) * \
                    60 + int(end_minute_by_user)
                current_time = int(hour) * 60 + int(minute)

                if (current_time >= start_time_by_user and end_time_by_user > current_time) is False:
                    logger.debug(
                        f"make_calls --- dialer range time is {conf['start']} to {conf['end']}, going to sleep...")
                    self.to_unify_calls_tables = True
                    if (start_time_by_user - current_time) > 0:
                        sleep_time = (start_time_by_user - current_time) * 60
                    else:
                        sleep_time = (24 * 60 - current_time +
                                      start_time_by_user) * 60
                    continue

                max_calls_per_sec = int(conf["maxCallsPerSecond"])
                max_concurrent_calls = int(conf["concurrent"])
                for item in calls_table_lines:
                    if not self.dialer_is_running:
                        logger.debug(
                            f"make_calls --- dialer has been stopped, going to sleep...")
                        sleep_time = DIALER_STOPPED_SLEEP_TIME * 60  # Going to sleep
                        break

                    # Check if we reached the maximum allowed calls concurrently
                    # Maybe can be put also in the beginning of the while loop
                    if self.num_of_ongoing_calls == max_concurrent_calls:
                        logger.debug(
                            f"make_calls --- number of ongoing calls reached to the limit {max_concurrent_calls}")
                        break

                    # Check if the call reached number of attempts
                    num_of_attempts = item.get("tries", 0)
                    # Should be preprocessing before
                    if num_of_attempts >= int(conf["maxRetries"]) + 1:
                        continue

                    # Check if enough time has passed from the last call
                    last_call = item.get("lastCall", None)
                    if last_call:
                        retry_time = int(conf['retryTime'])
                        tdelta = datetime.now() - datetime.strptime(last_call, '%H:%M:%S')
                        if (tdelta.seconds / 60) < retry_time:
                            continue

                    # Should add handling for max calls per sec - this could be achieved by makeing async requests

                    url = f"https://{conf['host']}/api/v1/actions/dialout"
                    metadata = (json.loads(
                        "{ " + item["metadata"] + " }") if item.get("metadata") else {})
                    payload = {
                        "bot": conf["bot"],
                        "target": item["phone"],
                        "caller": conf["caller"],
                        "callerHost": "example.com",  # ???
                        "callerDisplayName": "My company",  # ????
                        "answerTimeoutSec": 20,  # Should be some default?
                        "notifyUrl": f"http://{os.getenv('DIALER_SERVER_NOTIFY')}:{self.port}/notification",
                        "machineDetection": conf["machineDetection"],
                        "metadata": metadata,
                    }

                    auth = HTTPBasicAuth(
                        conf["clientId"], conf["clientSecret"])
                    try:
                        logger.debug(
                            f"make_calls --- doing POST request, payload: {payload}")
                        r = requests.post(
                            url, json=payload, auth=auth, verify=False)  # Why verify??
                        max_calls_per_sec -= 1
                        if r.status_code != 200:
                            logger.debug(
                                f"make_calls --- call for {item['phone']} failed with status code: {r.status_code} for reason: {r.reason}. more information: {r.text}")
                            self.database.update_call_by_phone(
                                item["phone"],
                                {
                                    "conversationId": None,
                                    "status": "failed",
                                    "reason": r.reason,
                                    "reasonCode": f"http error code: {r.status_code}",
                                },
                                True
                            )
                            raise Exception(
                                f"status_code: {r.status_code}, reason: {r.reason}")
                        self.num_of_ongoing_calls += 1  # Maybe should be under lock
                        data = json.loads(r.content.decode())
                        logger.debug(
                            f"make_calls --- call for {item['phone']} returned with <200 OK>. data: {data}")
                        self.database.update_call_by_phone(
                            item["phone"], {"conversationId": data["conversationId"]})
                    except Exception as e:
                        logger.error(e)

                logger.debug(
                    f"make_calls --- calls iteration has ended. going to sleep...")
                retry_time = int(
                    self.database.get_conf_param_value("retryTime"))
                sleep_time = retry_time * 60

        except Exception as e:
            logger.error(e)

    def start_routine(self):
        logger.debug(f"In start_routine()...")
        t = threading.Thread(target=self.make_calls, args=())
        t.daemon = True
        t.start()

    def run(self):
        logger.debug(f"In run()...")

        @app.route("/notification", methods=["POST"])
        def notification():
            logger.debug(f"In notification()...")
            try:
                data = json.loads(request.data.decode())
                logger.debug(
                    f"notification --- got data: {data}. updating database...")
                conversation_status = data.get('status')
                if conversation_status == 'failed' or conversation_status == 'completed':
                    self.num_of_ongoing_calls -= 1  # Maybe should be under lock
                    self.sleeper.wake()
                self.database.update_call_by_conversation_id(data)
            except Exception as e:
                logger.error(e)

            return ""

        # TODO
        @app.route("/configuration", methods=["GET", "POST"])
        def load_conf():
            logger.debug(f"In load_conf()...")
            if request.method == "POST":
                try:
                    data = json.loads(request.data.decode())
                    logger.debug(f"load_conf --- POST request. data: {data}")
                    # Should do some extra work to verify the input...
                    # data["scope"] = data["scope"].split("+")
                    # Check that all the necessary params has been sent
                    for param in VAG_CONNECTION_PARAMS:
                        if data.get(param, None) is None:
                            raise Exception(
                                f"Parameter '{param}' was not supplied")

                    self.database.load_conf_to_db(data)
                except Exception as e:
                    logger.error(f"load_conf --- error: {e}")
                    return f"Failed to load configuration. error: {e}"

                logger.debug(
                    f"load_conf --- waking up other thread to do its routine...")
                self.sleeper.wake()
                return {"success": True, "data": "configuration was loaded...."}
            else:
                logger.debug(f"load_conf --- GET request")
                return {"success": True, "data": self.database.get_conf_from_db()}

        @app.route("/callHistory", methods=["GET"])
        def get_call_history():
            logger.debug(f"In get_call_history()...")
            try:
                params = request.args
                logger.debug(f"get_call_history --- phone: {params['phone']}")
                call_history = self.database.get_call_by_phone(
                    params["phone"]).get("callHistory")
            except Exception as e:
                logger.error(f"get_call_history --- error: {e}")
                return {"success": False, "message": e}

            return {"success": True, "data": call_history}

        @app.route("/deleteCall", methods=["DELETE"])
        def delete_call():
            logger.debug(f"In delete_call()...")
            try:
                data = json.loads(request.data.decode())
                logger.debug(f"delete_call --- phone: {data['phone']}")
                self.database.remove_line("phone", data["phone"])
            except Exception as e:
                logger.error(f"delete_call --- error: {e}")
                return {"success": False, "message": e}

            return {"success": True, "data": "call has been removed...."}

        @app.route("/cleanCalls", methods=["DELETE"])
        def clean_calls():
            logger.debug(f"In clean_calls()...")
            try:
                self.database.remove_all_lines("pending_calls")
                with open("./calls.csv", "w") as f:
                    f.write("")
            except Exception as e:
                logger.error(f"cleanCalls --- error: {e}")
                return {"success": False, "message": e}

            return {"success": True, "data": "all calls have been removed...."}

        @app.route("/appendCalls", methods=["POST"])
        def append_new_calls():
            logger.debug(f"In append_new_calls()...")
            try:
                file = request.files["myFile"]
                file_contents = file.stream.read().decode("utf-8").replace("\ufeff", "")
                if not file:
                    return {"success": False, "message": "No File Was Attached"}

                new_calls = []
                with open("./calls.csv", "w") as f:
                    f.write(file_contents)

                with open("./calls.csv", encoding="utf-8") as f:
                    csvReader = csv.DictReader(f)
                    for row in csvReader:
                        new_calls.append(row)

                logger.debug(
                    f"append_new_calls --- append calls to database...")
                self.database.append_calls_to_db(new_calls)
                logger.debug(
                    f"append_new_calls --- waking up other thread to do its routine...")
                self.sleeper.wake()
            except Exception as e:
                logger.error(f"append_new_calls --- error: {e}")
                return {"success": False, "message": e}

            return {"success": True, "data": "calls were added...."}

        @app.route("/newCalls", methods=["POST"])
        def load_new_calls():
            logger.debug(f"In load_new_calls()...")
            try:
                file = request.files["myFile"]
                file_contents = file.stream.read().decode("utf-8").replace("\ufeff", "")
                print(type(file))
                if not file:
                    return {"success": False, "message": "No File Was Attached"}

                new_calls = []

                with open("./calls.csv", "w") as f:
                    f.write(file_contents)

                with open("./calls.csv", encoding="utf-8") as f:
                    csvReader = csv.DictReader(f)
                    for row in csvReader:
                        new_calls.append(row)

                logger.debug(
                    f"load_new_calls --- replace new calls with existing on database...")
                self.database.replace_calls_in_db(new_calls)
                logger.debug(
                    f"load_new_calls --- waking up other thread to do its routine...")
                self.sleeper.wake()
            except Exception as e:
                logger.error(f"load_new_calls --- error: {e}")
                return {"success": False, "message": e}

            return {"success": True, "data": "calls were loaded...."}

        @app.route("/dialerAction", methods=["POST"])
        def dialer_action():
            logger.debug(f"In dialerAction()...")
            try:
                data = json.loads(request.data.decode())
                logger.debug(f"dialerAction --- action: {data['action']}")
                if data["action"] == "start":
                    self.dialer_is_running = True
                    self.sleeper.wake()
                else:  # Meaning 'stop' right now
                    self.dialer_is_running = False

                return {
                    "success": True,
                    "data": f"dialer was {'started' if self.dialer_is_running else 'stopped'}",
                }

            except Exception as e:
                logger.error(f"dialerAction --- error: {e}")
                return {"success": False, "message": f"{e}"}

        @app.route("/callsFile", methods=["GET"])
        def get_calls_file():
            logger.debug(f"In callsFile()...")
            try:
                table_rows = self.database.get_table_lines(
                    "answered_calls") + self.database.get_table_lines("pending_calls")
                with open("./outbound.csv", "w") as f:
                    logger.debug(f"callsFile --- writing .csv file..")
                    f = csv.writer(f)
                    f.writerow(CSV_HEAD)

                    # Create other rows
                    for record in table_rows:
                        row = []
                        for key in CSV_HEAD:
                            row.append(record[key])
                        f.writerow(row)

                return send_file("./outbound.csv", attachment_filename="outbound.csv")
            except Exception as e:
                logger.error(f"callsFile --- error: {e}")
                return {"success": False, "message": f"{e}"}

        @app.route("/calls", methods=["GET", "POST"])
        def load_calls():
            logger.debug(f"In calls()...")
            try:
                # Should be removed... because now we have /newCalls
                if request.method == "POST":
                    # Should do some extra work to verify the input...
                    data = json.loads(request.data.decode())
                    logger.debug(f"calls --- POST request. data: {data}")
                    # Check that all the necessary params has been sent
                    for call in data["calls"]:
                        for param in CALL_PARAMS:
                            if call.get(param, None) is None:
                                raise Exception(
                                    f"Parameter '{param}' was not supplied")

                    self.database.replace_calls_in_db(data["calls"])
                    return {"success": True, "data": "calls were loaded...."}
                else:
                    logger.debug(f"calls --- GET request.")
                    limit = request.args.get('limit')
                    page = request.args.get('page')
                    search_value = request.args.get('search')
                    filters = request.args.getlist('filters[]')
                    start_index = (int(page) - 1) * int(limit)
                    end_index = start_index + int(limit)
                    calls = self.database.get_calls_from_db()
                    # Filter by search filters
                    if search_value and filters:
                        filteredCalls = calls
                        calls = []
                        for call in filteredCalls:
                            exit = False
                            for filter in filters:
                                if exit:
                                    break
                                if search_value not in call.get(filter, ''):
                                    exit = True
                            if not exit:
                                calls.append(call)
                    page_calls = [] if len(calls) <= start_index else calls[start_index: len(
                        calls) if len(calls) <= end_index else end_index]

                    # Colelct statictics
                    answeredCalls = 0
                    notExcecutedCalls = 0
                    failedCalls = 0
                    for call in calls:
                        if call.get('status', '') is 'answered' or call.get('status', '') is 'completed':
                            answeredCalls += 1
                        elif not call.get('status', ''):
                            notExcecutedCalls += 1
                        else:
                            failedCalls += 1

                    return {
                        "success": True,
                        "data": {
                            "calls": page_calls,
                            "head_lines": CALL_HEAD_LINES_MAP,
                            "metadata": {
                                "dialer_status": self.dialer_is_running,
                                "answeredCalls": answeredCalls,
                                "notExcecutedCalls": notExcecutedCalls,
                                "failedCalls": failedCalls
                            },
                            "total_num_of_calls": len(calls)
                        },
                    }
            except Exception as e:
                logger.error(f"calls --- error: {e}")
                return {"success": False, "message": f"{e}"}

        logger.debug(
            f"run --- running the server app, host:{self.host}, port: {self.port}..."
        )
        app.run(host=self.host, port=self.port)


def serve(server):
    logger.debug(f"In serve()...")
    server.run()


if __name__ == "__main__":
    # app.run(host="0.0.0.0", port=6666)  # 0.0.0.0
    server = FlaskAppWrapper("0.0.0.0", os.getenv('DIALER_SERVER_PORT'))
    logger.debug(f"In __main__. running routine thread")
    t = threading.Thread(target=serve, args=(server,))
    t.start()
