// B-036 / B-038: exceljs' own types expect Node (stream, NodeJS) and break the
// browser build, so the app imports the package's browser bundle untyped.
declare module 'exceljs/dist/exceljs.min.js';
