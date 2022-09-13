import '../css/App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import React from 'react';
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";
import NavBar from './NavBar';
// import Home from './Home';
import Configuration from './Configuration';
import Calls from './Calls';
// import Results from './Results';
import NoMatch from './NoMatch';


var HOST = process.env.REACT_APP_DIALER_SERVER_HOST
var PORT = process.env.REACT_APP_DIALER_SERVER_PORT


export default class App extends React.Component {
  render() {
    return (
      <div className="App">
        <React.Fragment>
          <Router>
            <NavBar />
            <div style={{ paddingTop: '15vh', height: '5vh', width: '100%' }}></div>
            <Switch>
              <Route exact path="/" render={(props) => (<Configuration {...props} host={HOST} port={PORT} />)} />
              <Route exact path="/configuration" render={(props) => (<Configuration {...props} host={HOST} port={PORT} />)} />
              <Route exact path="/calls" render={(props) => (<Calls {...props} host={HOST} port={PORT} />)} />
              {/* <Route exact path="/results" component={Results} /> */}
              <Route component={NoMatch} />
            </Switch>
          </Router>
        </React.Fragment>
      </div>)
  }
}
