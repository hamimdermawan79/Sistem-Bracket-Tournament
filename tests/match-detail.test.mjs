import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const components = new Map();
function component(name) {
  if (components.has(name)) return components.get(name);
  const source = readFileSync(new URL(`../src/components/${name}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const dependency = path => path.startsWith('./') ? component(path.slice(2)) : require(path);
  new Function('require', 'module', 'exports', compiled)(dependency, module, module.exports);
  components.set(name, module.exports);
  return module.exports;
}
const Detail = component('MatchDetailModal').default;
const base = { isOpen: true, round: 1, matchNumber: 11, onClose() {}, onOpenAddPlayer() {}, onSelectWinner() {}, onCancelWinner() {}, onSetPlaying() {} };
const p1 = { slot: 21, name: 'Player One', team: { id: 'one', name: 'Team One', logo_url: '/team-one.png' } };
const p2 = { slot: 22, name: 'Player Two', team: { id: 'two', name: 'Team Two', logo_url: '/team-two.png' } };
const render = props => renderToStaticMarkup(React.createElement(Detail, { ...base, ...props }));

test('future labels identify the correct feeder matches across both halves and the final', () => {
  const label = component('MatchDetailModal').getMatchPlayerLabel;
  assert.equal(label(undefined, 2, 1, 0), 'Winner R1-M01');
  assert.equal(label(undefined, 2, 1, 1), 'Winner R1-M02');
  assert.equal(label(undefined, 2, 17, 0), 'Winner R1-M33');
  assert.equal(label(undefined, 2, 32, 1), 'Winner R1-M64');
  assert.equal(label(undefined, 7, 1, 0), 'Winner R6-M01');
  assert.equal(label(undefined, 7, 1, 1), 'Winner R6-M02');
  assert.equal(label(undefined, 4, 1, 0, 4), 'TBD', 'a smaller drawing starts at its actual first round');
  assert.equal(label(undefined, 5, 1, 0, 4), 'Winner R4-M01');
  assert.equal(label({ slot: 1, name: '' }, 4, 1, 0, 4), 'TBD');
  assert.equal(label(p1, 2, 1, 0), 'Player One', 'an actual candidate replaces the feeder label');
});

test('guest sees both players and team logos without administrative controls', () => {
  const html = render({ p1, p2, isAdmin: false });
  for (const text of ['Player One', 'Player Two', '/team-one.png', '/team-two.png', 'VS']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Edit pemain|Isi pemain|Pilih pemenang|Batalkan hasil|Mulai bermain/);
});
test('empty slots still show details; guest cannot edit and admin can fill them', () => {
  const props = { p1: { slot: 1, name: '' }, p2: { slot: 2, name: '' } };
  const guest = render({ ...props, isAdmin: false });
  assert.match(guest, /TBD/);
  assert.doesNotMatch(guest, /Isi pemain|Pilih pemenang/);
  const admin = render({ ...props, isAdmin: true });
  assert.equal((admin.match(/aria-label="Isi pemain &amp; tim:/g) || []).length, 2);
  assert.equal((admin.match(/disabled=""/g) || []).length, 3, 'empty players cannot play or be declared winners');
});
test('admin has edit and winner controls; completed matches offer cancellation', () => {
  const html = render({ p1, p2, isAdmin: true });
  assert.equal((html.match(/aria-label="Edit pemain &amp; tim:/g) || []).length, 2);
  assert.equal((html.match(/aria-label="Pilih pemenang:/g) || []).length, 2);
  assert.match(html, /aria-label="Mulai bermain"/);
  const finished = render({ p1, p2, isAdmin: true, winnerSlot: 21 });
  assert.match(finished, /Pemenang/);
  assert.match(finished, /Batalkan hasil/);
  assert.doesNotMatch(finished, /Pilih pemenang/);
  assert.doesNotMatch(finished, /Mulai bermain|Berhenti bermain/);
});
test('activity can be stopped and completed state overrides stale playing state', () => {
  const playing = render({ p1, p2, isAdmin: true, isPlaying: true });
  assert.match(playing, /aria-label="Berhenti bermain"/);
  assert.match(playing, /aria-pressed="true"/);
  for (const name of ['CompactMatch', 'BracketMatch']) {
    const Component = component(name)[name];
    const active = renderToStaticMarkup(React.createElement(Component, { ...base, p1, p2, isPlaying: true }));
    assert.match(active, /is-playing/);
    const finished = renderToStaticMarkup(React.createElement(Component, { ...base, p1, p2, isPlaying: true, winnerSlot: 21 }));
    assert.match(finished, /is-completed/);
    assert.match(finished, /is-loser/);
    assert.doesNotMatch(finished, /is-playing/);
  }
});
test('future positions show waiting state without editing a fabricated slot', () => {
  const html = render({ isAdmin: true });
  assert.match(html, /Menunggu pemain/);
  assert.doesNotMatch(html, /Isi pemain|Edit pemain|Pilih pemenang/);
});
test('both bracket styles expose one detail trigger and no inline edit or W buttons', () => {
  for (const name of ['CompactMatch', 'BracketMatch']) {
    const Component = component(name)[name];
    const html = renderToStaticMarkup(React.createElement(Component, { ...base, p1, p2, isAdmin: true }));
    assert.equal((html.match(/<button/g) || []).length, 1);
    assert.match(html, /aria-haspopup="dialog"/);
    assert.doesNotMatch(html, /Edit.*Slot|win-btn|add-btn/);
  }
});
