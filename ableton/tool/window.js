// The picture in the README: `node ableton/tool/window.js` redraws ableton/tool/window.png.
// The tool in Live's Generate panel, after Generate in a clip in E flat minor.
const P = require('../kit/test/picture.js');
P(__dirname, { bundle: 'MidiCatalogueTool.js', w: 152, h: 147, apply: { context: P.EB_MINOR } });
