import { Form, Button, Modal } from 'react-bootstrap';
import React from 'react';
const axios = require('axios');

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
var DOC = "https://techdocs.audiocodes.com/voice-ai-connect/#VAIG_Combined/outbound-calling.htm"

export default class Configuration extends React.Component {
    constructor(props) {
        super(props);
        console.log('Configuration constructor')
        this.state = {
            items: [['host', 'Host', 'text', 'Your host', true],
            ['clientId', 'Client ID', 'text', 'Your client id', true],
            ['clientSecret', 'Client secret', 'password', 'Your client secret', true],
            // ['scope', 'Scope', 'text', 'For example: actions:dialout, mspower-scope'],
            ['bot', 'Bot', 'text', 'Your bot name', true],
            ['caller', 'caller', 'text', 'Who is calling', false],
            ['start', 'Start hour', 'text', 'For example: 16:00', true],
            ['end', 'End hour', 'text', 'For example: 19:00', true],
            ['retryTime', 'Retry time between calls (In Minutes)', 'text', 'For example: 7', true],
            ['maxRetries', 'Max retries', 'text', 'Max retries', true],
            ['machineDetection', 'Machine detection', 'text', 'disabled/disconnect/detect', true],
            ['maxCallsPerSecond', 'Max calls per second', 'text', 'For example: 1', true],
            ['concurrent', 'Max concurrent calls', 'text', 'For example: 100', true]],
            modified: false,
            alert: {
                message: '',
                hidden: true,
            }
        };
        this.generateItems = this.generateItems.bind(this);
        this.submitForm = this.submitForm.bind(this);
        this.checkResponse = this.checkResponse.bind(this)
        this.createAlert = this.createAlert.bind(this)
    }

    checkResponse(resp) {
        if (resp.status !== 200) {
            this.setState({ alert: { 'message': `statusText: ${resp.statusText}`, 'hidden': false, variant: 'danger' } })
            return false
        }

        if (!resp.data.success) {
            this.setState({ alert: { 'message': resp.data.message, 'hidden': false, variant: 'danger' } })
            return false
        }

        return true;
    }

    componentDidMount() {
        // Getting current configuration if exists
        let itemsStatus = {}
        for (let item of this.state.items) {
            itemsStatus[item[0]] = {
                modified: false
            }
        }
        this.setState({ itemsStatus: itemsStatus })
        axios({
            method: 'get',
            url: `http://${this.props.host}:${this.props.port}/configuration`,
        }).then((resp) => {
            if (!this.checkResponse(resp))
                return

            for (let confItem in resp.data.data) {
                document.getElementById(confItem).value = resp.data.data[confItem]
            }
        }).catch((err) => {
            this.setState({ alert: { 'message': err.message, 'hidden': false, variant: 'danger' } })
        });
        document.getElementById('navConfiguration').style.fontWeight = 'bold' // Workaround for now...(maybe until we will use hooks)
    }

    generateItems() {
        let lines = []
        for (let tupleItem of this.state.items) {
            lines.push(
                <Form.Group controlId={tupleItem[0]} key={tupleItem[0]}>
                    <Form.Label style={{ borderColor: 'red', width: '100%', textAlign: 'start' }}>
                        {tupleItem[1]}
                    </Form.Label>
                    <Form.Control style={{ borderWidth: (this.state.itemsStatus && this.state.itemsStatus[tupleItem[0]].modified) ? '2px' : '1px', borderColor: (this.state.itemsStatus && this.state.itemsStatus[tupleItem[0]].modified) ? this.state.itemsStatus[tupleItem[0]].borderColor : 'grey' }} onChange={() => {
                        console.log('hereee: tupleItem[0]:   ' + tupleItem[0])
                        let itemsStatus = this.state.itemsStatus
                        itemsStatus[tupleItem[0]].modified = true
                        itemsStatus[tupleItem[0]].borderColor = (document.getElementById(tupleItem[0]).value === '' && tupleItem[4] === true) ? 'red' : '#00b300'
                        this.setState({ itemsStatus: itemsStatus, modified: true })
                    }
                    } type={tupleItem[2]} placeholder={(tupleItem.length > 3) ? tupleItem[3] : ''} />
                </Form.Group>
            )
        }

        return lines
    }

    submitForm() {
        console.log('In submitForm()...')
        let data = {};
        for (let item of this.state.items) {
            let itemValue = document.getElementById(item[0]).value;
            if (itemValue === '' && item[4] === true) {
                this.setState({ alert: { 'message': 'Please fill all the form...', 'hidden': false, variant: 'danger' } })
                return;
            }

            data[item[0]] = itemValue
        }
        console.log('data: ' + { data })

        // User filled all the fields
        axios({
            method: 'post',
            url: `http://${this.props.host}:${this.props.port}/configuration`,
            data
        }).then((resp) => {
            if (!this.checkResponse(resp))
                return

            this.setState({ alert: { 'message': resp.data.data, 'hidden': false, variant: 'success' } })
            console.log('message: ' + resp.data.message)
        }).catch((err) => {
            this.setState({ alert: { 'message': err.message, 'hidden': false, variant: 'danger' } })
        });
    }

    createAlert() {
        if (!this.state.alert['hidden'])
            setTimeout(() => { this.setState({ alert: { 'hidden': true, 'message': '' } }) }, 3000);

        return (
            <Modal show={!this.state.alert['hidden']}> 
                <Modal.Body style={ALERT_STYLE[this.state.alert.variant]}>
                    <div  style={{height: '100%'}}> 
                        {this.state.alert['message']}
                    </div>
                </Modal.Body>
                <Modal.Footer style={ALERT_STYLE[this.state.alert.variant]}>
                    <Button variant="secondary" onClick={() => { this.setState({ alert: { 'hidden': true, 'message': '' } }) }}>
                        Close
                    </Button>
                </Modal.Footer>
            </Modal>)
    }

    render() {
        let items = this.generateItems()
        let configurationStyle = {height: '100%', width: '100%', flexDirection: 'column', display: 'flex', alignItems: 'center'}
        let headerStyle = {width: '100%', flex: 3, verticalAlign: 'center'}
        let bodyStyle = {flex: 12, width: '60%', borderWidth: '1px', border: '1px solid #ced4da', borderRadius: '25px', alignItems: 'center'}
        let formStyle = { height: '80%', width: '90%', margin: 'auto' }

        return (
            <div id="Configuration" style={configurationStyle}>
                <div style={headerStyle}>
                    <h5><a href={DOC}>Documentation</a></h5>
                </div>
                <div style={bodyStyle} className="Configuration">
                    <div style={{ height: '5vh' }}></div>
                    <Form style={formStyle}>
                        {items}
                    </Form>
                    <div style={{ height: '5vh' }}></div>
                    <Button
                        disabled={!this.state.modified}
                        style={{ height: '5%', width: '20%' }}
                        size='sm'
                        variant="primary"
                        type="button"
                        onClick={this.submitForm}
                    >
                        Apply
                    </Button>
                    <div style={{ height: '5vh' }}></div>
                    {this.createAlert()}
                </div>
            </div>
        )
    }
}
