/**
 * Entry point for the Claude Design (.dc.html) build.
 *
 * Unlike the artifact, this one runs the live personas: the Design host proxies
 * /v1/messages, which is why the original prototype could call it with no key.
 * So the default proxy mode is correct here and nothing needs configuring.
 */

import App from '../relationshiproom.jsx';

export function RelationshipRoom() {
  return <App />;
}
