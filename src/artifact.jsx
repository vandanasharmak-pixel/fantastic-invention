/**
 * Entry point for the published artifact.
 *
 * A claude.ai artifact runs under a CSP that blocks every outbound request, so
 * the Messages API is unreachable and the AI-played personas cannot run here.
 * Rather than ship a broken key field, this build commits to rehearsal: the
 * full five episodes with the client following Deliverable Five's branch table.
 * Everything else — the Trust Meter, Hold and Replay, all twenty cards, the
 * Grand Debrief — is the same code the live build runs.
 */

import { createRoot } from 'react-dom/client';
import App from '../relationshiproom.jsx';
import { configureApi } from './core/api.js';

configureApi({ mode: 'rehearsal' });

createRoot(document.getElementById('root')).render(<App />);
