import { Navbar, Nav } from 'react-bootstrap';
import React from 'react';
import logo from '../img/VAIC.svg'


export default class NavBar extends React.Component {
    constructor(props) {
        super(props)
        console.log('NavBar constructor')
    }

    render() {
        console.log('NavBar render')
        let navStyle = { backgroundColor: '#001f44', height: '10vh', width: '100%', flexDirection: 'row', display: 'flex', position: 'fixed' }

        return (
            <div style={navStyle} className="NavBar">
                <div style={{ height: '100%', flex: 7 }}>
                    <Navbar style={{ height: '100%', width: '100%' }} variant="dark">
                        <Navbar.Brand href="/">Outbound App</Navbar.Brand>
                        <Nav className="mr-auto">
                            <Nav.Link id='navConfiguration' style={{ color: 'white', fontWeight: 'normal' }} href="/configuration">configuration</Nav.Link>
                            <Nav.Link id="navCalls" style={{ color: 'white', fontWeight: 'normal' }} href="/calls">calls</Nav.Link>
                        </Nav>
                    </Navbar>
                </div>
                <div style={{ height: '100%' }}>
                    <img
                        src={logo}
                        height='100%'
                        className="d-inline-block align-top"
                        alt="React Bootstrap logo"
                    />
                </div>
            </div>)
    }
}
