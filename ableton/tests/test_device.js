/* The Max for Live device, run in Node on a pretend Max and a pretend Live.
 *   python3 ableton/kit/build.py ableton/device.json && node --test ableton/tests/ */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const suite = require('../kit/test/generator_suite.js');
require('../kit/test/palette_suite.js')();

const { device } = suite({ bundle: path.join(__dirname, '..', 'MidiCatalogue.js'), name: 'Midi Catalogue', varies: false });

function setInst(d, name) {
  const s = d.ctx.S.settings.find((x) => x.id === '$inst');
  const i = s.names.indexOf(name);
  assert.ok(i >= 0, name + ' in ' + s.names.join(', '));
  d.ctx.setSetting('$inst', i + 1);
}

test('the music is written for the instrument chosen, inside its range', () => {
  const d = device();
  const s = d.ctx.S.settings.find((x) => x.id === '$inst');
  assert.ok(s && s.names.length > 20, 'the orchestra is offered');
  for (const name of ['Violin I', 'Tuba', 'Piccolo']) {
    if (!s.names.includes(name)) continue;
    setInst(d, name);
    const inst = d.ctx.INSTRUMENTS.find((x) => x.name === name);
    assert.ok(d.ctx.S.results.length > 0, name + ': ' + d.ctx.S.status);
    for (const r of d.ctx.S.results) for (const p of r.parts) for (const n of p.notes) {
      assert.ok(n.pitch >= inst.low && n.pitch <= inst.high, name + ' ' + r.title + ': ' + n.pitch);
    }
  }
});

test('the instrument comes back with the set', () => {
  const d = device();
  setInst(d, d.ctx.INSTRUMENTS[3].name);
  const e = device();
  e.send('restore', JSON.stringify(d.saved()));
  assert.strictEqual(e.ctx.S.inst, d.ctx.INSTRUMENTS[3].id);
});

test('a section writes one part per instrument, each on its own track', () => {
  const d = device();
  const s = d.ctx.S.settings.find((x) => x.id === 'section');
  d.ctx.setSetting('section', 2);
  const r = d.ctx.S.results[0];
  assert.ok(r && r.parts.length > 1, s.names[1] + ': ' + d.ctx.S.status);
  d.click('Insert');
  assert.strictEqual(d.set.tracks.length, r.parts.length);
});
