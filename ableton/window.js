// The picture in the README: `node ableton/window.js` redraws ableton/window.png.
// The catalogue for Violin I.
require('./kit/test/picture.js')(__dirname, { bundle: 'MidiCatalogue.js', w: 860, h: 169,
  go(d) { const s = d.ctx.S.settings.find((x) => x.id === '$inst'); d.ctx.setSetting('$inst', s.names.indexOf('Violin I') + 1); } });
