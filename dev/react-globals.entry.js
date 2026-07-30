// Stands in for the React UMD bundles support.js would fetch from unpkg, which
// this environment's egress policy blocks. Sets the same globals, so
// loadReactUmd() short-circuits and the real .dc.html is exercised unmodified.
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
window.React = React;
window.ReactDOM = ReactDOMClient;
