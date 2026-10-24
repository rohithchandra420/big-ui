export const environment = {
    // The API's own subdomain of the UI's domain (PWA Phase 0), so the login
    // cookie is same-site instead of third-party.
    URL: 'https://api.rchomeproject.in',
    // Kept in sync manually with CHANGELOG.md's latest version — no build
    // tooling currently wires package.json's version into the bundle.
    version: '1.17.2'
};
