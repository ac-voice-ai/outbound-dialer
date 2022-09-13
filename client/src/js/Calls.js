import { Table, Button, Modal, Card } from 'react-bootstrap';
import React from 'react';
import { MdDelete, MdTimeline } from 'react-icons/md';
const axios = require('axios');
const FileDownload = require('js-file-download');


var ALERT_STYLE = {
    'danger': {
        color: '#721c24',
        backgroundColor: '#f8d7da',
        borderColor: 'f5c6cb',
    },
    'success': {
        color: '#155724',
        backgroundColor: '#d4edda',
        borderColor: '#c3e6cb'
    },
}

export default class Calls extends React.Component {
    constructor(props) {
        super(props);
        console.log('Calls constructor')
        this.state = {
            calls: [],
            head_lines: [],
            current_action: 'Pick An Action',
            selectedFile: undefined,
            actionToUrl: {
                'Clean All Calls': '/cleanCalls',
                'Upload New Calls': '/newCalls',
                'Append New Calls': '/appendCalls',
                'Get Calls As A File': '/callsFile',
                'Start Dialer': '/dialerAction',
                'Stop Dialer': 'dialerAction'
            },
            metadata: {
                answeredCalls: 0,
                notExcecutedCalls: 0,
                failedCalls: 0
            },
            showAddModal: false,
            showCallHistoryModal: false,
            callHistory: null,
            alert: {
                message: '',
                hidden: true,
                variant: 'danger'
            },
            pagination: {
                // Should add properties here
                pageSize: 10,
                pageIndex: 1,
            },
            search: {
                value: '',
            },
            searchFilters: {},
        };

        this.generateTableHead = this.generateTableHead.bind(this);
        this.generateTableRows = this.generateTableRows.bind(this);
        this.launchRequest = this.launchRequest.bind(this);
        this.onFileChange = this.onFileChange.bind(this);
        this.getCalls = this.getCalls.bind(this);
        this.createAddModal = this.createAddModal.bind(this);
        this.createAlert = this.createAlert.bind(this);
        this.makeAxiosRequest = this.makeAxiosRequest.bind(this);
        this.gotoPage = this.gotoPage.bind(this);
        this.createFilters = this.createFilters.bind(this);
    }

    gotoPage(pageIndex) {
        console.log('in gotoPage, pageSize: ' + this.state.pagination.pageSize + ', pageIndex: ' + pageIndex);
        this.getCalls(this.state.pagination.pageSize, pageIndex);
        this.setState({ pagination: { ...this.state.pagination, pageIndex } });
    }

    async getCalls(limit, pageIndex) {
        // Extract relevant filters for the request
        const filters = [];
        for (let filter in this.state.searchFilters) {
            if (this.state.searchFilters[filter])
                filters.push(filter);
        }

        let config = {
            method: 'get',
            url: `http://${this.props.host}:${this.props.port}/calls`,
            params: {
                limit: limit || this.state.pagination.pageSize,
                page: pageIndex || this.state.pagination.pageIndex,
                search: this.state.search.value,
                filters
            }
        }
        console.log('in getCalls, params: ' + JSON.stringify(config.params));
        let resp = await this.makeAxiosRequest(config)
        if (!resp)
            return

        this.setState({
            calls: resp.data.data.calls,
            head_lines: resp.data.data.head_lines,
            numOfPages: Math.ceil(resp.data.data.total_num_of_calls / this.state.pagination.pageSize),
            metadata: resp.data.data.metadata
        })
        return
    }

    componentDidMount() {
        this.getCalls()
        document.getElementById('navCalls').style.fontWeight = 'bold' // Workaround for now...
        let that = this
        setInterval(() => that.getCalls(), 8000);
    }

    generateTableHead() {
        let heads = []
        for (let head_map of this.state.head_lines) {
            heads.push(
                <th>{head_map[1]}</th>
            )
        }
        heads.push(<th>Actions</th>)

        return heads
    }

    generateTableRows() {
        let rows = []
        for (let call in this.state.calls) {
            let row = []
            for (let head_map of this.state.head_lines) {
                row.push(<td>{this.state.calls[call][head_map[0]]}</td>)
            }
            row.push(
                <td style={{ display: 'flex', flexDirection: 'row', borderBottom: '0px' }}>
                    <Button
                        title="show call history"
                        style={{ flex: 1, background: 'inherit', borderColor: 'rgba(0,0,0,.05)', border: '0px' }}
                        onClick={() => {
                            this.setState({ current_action: `Show Call History - ${this.state.calls[call]['phone']}` }, this.launchRequest)
                        }}><MdTimeline style={{ color: '#1976d2' }} />
                    </Button>
                    <Button
                        title="remove call"
                        style={{ flex: 1, background: 'inherit', borderColor: 'rgba(0,0,0,.05)', border: '0px' }}
                        onClick={() => {
                            this.setState({ current_action: `Clean Call - ${this.state.calls[call]['phone']}` }, this.launchRequest)
                        }}><MdDelete style={{ color: 'red' }} />
                    </Button>
                </td>
            )
            let complete_row = [<tr>{row}</tr>]
            rows.push(complete_row)
        }

        return rows
    }

    async makeAxiosRequest(config, isFile = false) {
        try {
            let resp = await axios(config)
            if (resp.status !== 200) {
                this.setState({ selectedFile: undefined, alert: { 'message': `statusText: ${resp.statusText}`, 'hidden': false, variant: 'danger' } })
                return false
            }

            if (!resp.data.success && !isFile) {
                this.setState({ selectedFile: undefined, alert: { 'message': resp.data.message, 'hidden': false, variant: 'danger' } })
                return false
            }

            return resp
        } catch (err) {
            this.setState({ selectedFile: undefined, alert: { 'message': err.message, 'hidden': false, variant: 'danger' } })
            return false
        }
    }

    async launchRequest() {
        if (this.state.current_action.includes('Show Call History -')) {
            let callToShowHistory = this.state.current_action.substring(this.state.current_action.indexOf("-") + 2, this.state.current_action.length);
            let config = {
                method: 'get',
                url: `http://${this.props.host}:${this.props.port}/callHistory`,
                params: { phone: callToShowHistory }
            }
            let resp = await this.makeAxiosRequest(config)
            if (!resp)
                return

            this.setState({ callHistory: resp.data.data, showCallHistoryModal: true })
            return
        }

        if (this.state.current_action.includes('Clean Call -')) {
            let callToDelete = this.state.current_action.substring(this.state.current_action.indexOf("-") + 2, this.state.current_action.length);
            let config = {
                method: 'delete',
                url: `http://${this.props.host}:${this.props.port}/deleteCall`,
                data: {
                    phone: callToDelete
                }
            }
            let resp = await this.makeAxiosRequest(config)
            if (!resp)
                return

            this.setState({ selectedFile: undefined, alert: { 'message': resp.data.data, 'hidden': false, variant: 'success' } })
            this.getCalls()
            return
        }

        if (this.state.current_action === 'Get Calls As A File') {
            let config = {
                method: 'get',
                url: `http://${this.props.host}:${this.props.port}/callsFile`,
                responseType: 'blob'
            }
            let resp = await this.makeAxiosRequest(config, true)
            if (!resp)
                return

            FileDownload(resp.data, 'outbound.csv');
            return
        }

        if (this.state.current_action === 'Start Dialer' || this.state.current_action === 'Stop Dialer') {
            let config = {
                method: 'post',
                url: `http://${this.props.host}:${this.props.port}/${this.state.actionToUrl[this.state.current_action]}`,
                data: {
                    action: (this.state.current_action === 'Start Dialer') ? 'start' : 'stop'
                }
            }
            let resp = await this.makeAxiosRequest(config)
            if (!resp)
                return

            this.setState({
                metadata: { ...this.state.metadata, dialerStatus: !this.state.metadata.dialerStatus },
                alert: { 'message': resp.data.data, 'hidden': false, variant: 'success' }
            })
            return
        }

        if (this.state.current_action === 'Clean All Calls') {
            if (this.state.calls.length === 0)
                return

            let config = {
                method: 'delete',
                url: `http://${this.props.host}:${this.props.port}/${this.state.actionToUrl[this.state.current_action]}`,
            }
            let resp = await this.makeAxiosRequest(config)
            if (!resp)
                return

            this.setState({ selectedFile: undefined, alert: { 'message': resp.data.data, 'hidden': false, variant: 'success' } })
            this.getCalls()
            return
        }

        if (!this.state.selectedFile) {
            this.setState({ showAddModal: false, alert: { 'message': 'You must choose file before launching....', 'hidden': false, variant: 'danger' } })
            return
        }

        if (this.state.current_action === 'Upload New Calls' || this.state.current_action === 'Append New Calls') {
            const formData = new FormData();
            formData.append(
                "myFile",
                this.state.selectedFile,
                this.state.selectedFile?.name
            );

            // Details of the uploaded file 
            console.log(this.state.selectedFile);
            let config = {
                method: 'post',
                url: `http://${this.props.host}:${this.props.port}/${this.state.actionToUrl[this.state.current_action]}`,
                data: formData
            }
            let resp = await this.makeAxiosRequest(config)
            if (!resp)
                return

            this.setState({ selectedFile: undefined, alert: { 'message': resp.data.data, 'hidden': false, variant: 'success' } })
            this.getCalls()
            return
        }
    }

    onFileChange = event => {
        this.setState({ selectedFile: event.target.files[0] });
    }

    createCallHistoryModal() {
        let callHistory = this.state.callHistory
        if (!callHistory || !this.state.showCallHistoryModal)
            return null

        let records = []
        for (let call in callHistory) {
            let information = []
            for (let info in callHistory[call]['information']) {
                information.push(<p><strong>{info}: </strong>{callHistory[call]['information'][info]}</p>)
            }

            records.push(
                <Card body>
                    <h5 style={{ color: 'red' }}>Time: {callHistory[call]['time']}</h5>
                    {information}
                </Card>
            )
            records.push(<br />)
        }

        return (
            <Modal show={this.state.showCallHistoryModal} >
                <Modal.Header>
                    <Modal.Title>Call History</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {records}
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => this.setState({ showCallHistoryModal: false })}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>)
    }

    createAddModal() {
        return (
            <Modal show={this.state.showAddModal} >
                <Modal.Header>
                    <Modal.Title>Adding new calls to the list</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <div style={{ height: '100%' }}>
                        <input type="file" onChange={this.onFileChange} />
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => this.setState({ selectedFile: undefined, showAddModal: false })}>
                        Close
                    </Button>
                    <Button variant="primary" onClick={() => { this.setState({ showAddModal: false, current_action: 'Append New Calls' }, this.launchRequest) }}>
                        Apply
                    </Button>
                </Modal.Footer>
            </Modal>)
    }

    createAlert() {
        if (!this.state.alert['hidden'])
            setTimeout(() => { this.setState({ alert: { 'hidden': true, 'message': '', 'variant': 'danger' } }) }, 3000);

        return (
            <Modal show={!this.state.alert['hidden']}>
                <Modal.Body style={ALERT_STYLE[this.state.alert.variant]}>
                    <div style={{ height: '100%' }}>
                        {this.state.alert['message']}
                    </div>
                </Modal.Body>
                <Modal.Footer style={ALERT_STYLE[this.state.alert.variant]}>
                    <Button variant="secondary" onClick={() => { this.setState({ alert: { 'hidden': true, 'message': '', variant: 'danger' } }) }}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>)
    }

    createFilters() {
        console.log(`head_lines: ${JSON.stringify(this.state.head_lines)}`);
        const filters = [];

        for (let filter of this.state.head_lines) {
            filters.push(<div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                <input type="checkbox" name={filter[1]} value={filter[1]} onClick={(cb) => {
                    const searchFilters = this.state.searchFilters
                    searchFilters[filter[0]] = cb.target.checked
                    this.setState({ searchFilters }, this.getCalls)
                }}>
                </input>
                <label for={filter[1]} style={{ margin: 0 }}>{filter[1]}</label>
            </div>)
        }

        return filters;
    }

    render() {
        let callsStyle = { display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', width: '100%' }
        let headerStyle = { borderRadius: '25px', backgroundColor: '#F0ECEB', position: 'sticky', top: '10vh', display: 'flex', flexDirection: 'column', height: '20vh', width: '80%', alignItems: 'center' }
        let dialerControlStyle = { display: 'flex', flexDirection: 'column', flex: 2, width: '100%' }
        let dialerStatsStyle = { display: 'flex', flexDirection: 'row', flex: 2, width: '100%', alignItems: 'flex-end' }
        let dialerActionsStyle = { height: '10vh', width: '80%', alignItems: 'center', display: 'flex', flexDirection: 'row' }

        return (
            <div id="Calls" className="Calls" style={callsStyle}>
                <div style={headerStyle}>
                    <div style={dialerControlStyle}>
                        <h3 style={{ flex: 2, textAlign: 'center' }}>Dialer Is Currently {(this.state.metadata.dialerStatus) ? 'Running' : 'Stopped'}</h3>
                        <div style={{ flex: 1, margin: 'auto', display: 'flex' }}>
                            <Button
                                variant={(this.state.metadata.dialerStatus) ? "danger" : "success"}
                                onClick={() => {
                                    this.setState({ current_action: (this.state.metadata.dialerStatus) ? 'Stop Dialer' : 'Start Dialer' }, this.launchRequest)
                                }}
                            >
                                {(this.state.metadata.dialerStatus) ? 'Stop' : 'Start'}
                            </Button>
                        </div>
                    </div>
                    <div style={dialerStatsStyle}>
                        <h4 style={{ color: "#33cc33", flex: 1 }}>{`Answered Calls: ${this.state.metadata.answeredCalls}`}</h4>
                        <h4 style={{ color: "darkorange", flex: 1 }}>{`Pending Calls: ${this.state.metadata.notExcecutedCalls}`}</h4>
                        <h4 style={{ color: "red", flex: 1 }}>{`Failed Calls: ${this.state.metadata.failedCalls}`}</h4>
                    </div>
                </div>

                <div style={{ height: '5vh' }}></div>

                {/* search */}
                <div style={{ height: '10vh', width: '80%', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <input
                        type="search"
                        value={this.state.search.value}
                        placeholder="Type to search.."
                        onChange={(e) => this.setState({ search: { ...this.state.search, value: e.target.value }, pagination: { ... this.state.pagination, pageIndex: 1 } }, this.getCalls)}>
                    </input>
                    <br></br>
                    <div style={{ display: 'flex', flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
                        {this.createFilters()}
                    </div>
                </div>
                {/* search */}

                <div style={{ height: '5vh' }}></div>

                { /* pagination */}
                <div className="pagination">
                    <button onClick={() => this.gotoPage(1)} disabled={this.state.pagination.pageIndex === 1}>
                        {'<<'}
                    </button>{' '}
                    <button onClick={() => this.gotoPage(this.state.pagination.pageIndex - 1)} disabled={this.state.pagination.pageIndex === 1}>
                        {'<'}
                    </button>{' '}
                    <button onClick={() => this.gotoPage(this.state.pagination.pageIndex + 1)} disabled={!(this.state.pagination.pageIndex < this.state.numOfPages)}>
                        {'>'}
                    </button>{' '}
                    <button onClick={() => this.gotoPage(this.state.numOfPages)} disabled={!(this.state.pagination.pageIndex < this.state.numOfPages)}>
                        {'>>'}
                    </button>{' '}
                    <span>
                        Page{' '}
                        <strong>
                            {this.state.pagination.pageIndex} of {this.state.numOfPages || 1}
                        </strong>{' '}
                        | Go to page:{' '}
                        <input
                            type="number"
                            defaultValue={this.state.pagination.pageIndex}
                            onChange={e => {
                                const page = e.target.value ? Number(e.target.value) : 1
                                this.gotoPage(page)
                            }}
                            style={{ width: '100px' }}
                        />
                    </span>
                    <select
                        value={this.state.pagination.pageSize}
                        onChange={e => {
                            this.setState({ pagination: { ...this.state.pagination, pageSize: e.target.value, pageIndex: 1 } }, () => this.getCalls())
                        }}
                    >
                        {[5, 10, 15, 20, 25].map(pageSize => (
                            <option key={pageSize} value={pageSize}>
                                Show {pageSize}
                            </option>
                        ))}
                    </select>
                </div>
                { /* pagination */}

                <div style={dialerActionsStyle}>
                    <div style={{ height: '100%', flex: 1, display: 'flex', flexDirection: 'row' }}>
                        <div style={{ height: '100%', flex: 1, margin: 'auto', display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end' }}>
                            <Button
                                variant="danger"
                                onClick={() => {
                                    this.setState({ current_action: 'Clean All Calls' }, this.launchRequest)
                                }}
                            >
                                Clear list
                            </Button>
                        </div>
                    </div>
                    <div style={{ height: '100%', flex: 2, display: 'flex', flexDirection: 'row' }}>
                        {this.createAddModal()}
                        {this.createCallHistoryModal()}
                        <div style={{ height: '100%', flex: 1, margin: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}>
                            <Button
                                variant="success"
                                onClick={() => this.setState({ showAddModal: true })}
                            >
                                Add calls
                            </Button>
                        </div>
                    </div>
                    <div style={{ height: '100%', flex: 1 }}>
                        <div style={{ height: '100%', flex: 1, margin: 'auto', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
                            <Button
                                variant="dark"
                                onClick={() => {
                                    this.setState({ current_action: 'Get Calls As A File' }, this.launchRequest)
                                }}
                            >
                                Export .csv file
                            </Button>
                        </div>
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'row', height: '2vh', width: '80%' }}> </div>
                <Table style={{ width: '80%' }} striped bordered hover size="sm">
                    <thead>
                        <tr>
                            {this.generateTableHead()}
                        </tr>
                    </thead>
                    <tbody>
                        {this.generateTableRows()}
                    </tbody>
                </Table>
                { this.createAlert()}
            </div >)
    }
}
