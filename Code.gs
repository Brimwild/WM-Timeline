/**
 * West Marches expedition timeline — sheet builder and logging tools.
 *
 * Install: in your Google Sheet, Extensions → Apps Script, delete the placeholder,
 * paste this whole file, Save. Reload the sheet. A "West Marches" menu appears.
 * Then run: West Marches → Set up sheet.
 *
 * Everything here is idempotent. Running "Set up sheet" again repairs headers,
 * validation and formatting without touching your data.
 */

var SCHEMA = {
  expeditions: {
    headers: ['id', 'name', 'code', 'start_day', 'end_day', 'dm', 'real_date', 'color'],
    widths:  [ 92,   170,    58,     92,          92,        112,  112,          92]
  },
  roster: {
    headers: ['expedition_id', 'character'],
    widths:  [ 130,             170]
  },
  characters: {
    headers: ['name', 'player', 'status', 'created_day'],
    widths:  [ 170,    140,      104,      110]
  }
};

var RAMPS = ['teal', 'amber', 'purple', 'green', 'blue', 'pink', 'coral', 'gray'];
var STATUSES = ['active', 'retired', 'dead'];
var HEADER_BG = '#f1efe8';

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('West Marches')
    .addItem('Log an expedition…', 'showLogDialog')
    .addItem('Check timeline conflicts', 'showConflicts')
    .addSeparator()
    .addItem('Set up sheet', 'setUpSheet')
    .addItem('Add demo data', 'addDemoData')
    .addToUi();
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function setUpSheet() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SCHEMA).forEach(function (name) {
    var def = SCHEMA[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);

    sh.getRange(1, 1, 1, def.headers.length)
      .setValues([def.headers])
      .setFontWeight('bold')
      .setBackground(HEADER_BG);

    sh.setFrozenRows(1);
    def.widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });

    var extra = sh.getMaxColumns() - def.headers.length;
    if (extra > 0) sh.deleteColumns(def.headers.length + 1, extra);
  });

  // Remove the default empty sheet if it is still lying around.
  var leftover = ss.getSheetByName('Sheet1');
  if (leftover && leftover.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(leftover);
  }

  applyValidation_();
  applyConditionalFormats_();
  ss.setActiveSheet(ss.getSheetByName('expeditions'));
  SpreadsheetApp.getActive().toast('Sheet is ready. Use West Marches → Log an expedition.');
}

function applyValidation_() {
  var ss = SpreadsheetApp.getActive();
  var exp = ss.getSheetByName('expeditions');
  var ros = ss.getSheetByName('roster');
  var chr = ss.getSheetByName('characters');
  var N = 5000;

  var wholeDay = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .setHelpText('Campaign day as a whole number counted from day 0. Not a calendar date.')
    .build();
  exp.getRange(2, 4, N, 2).setDataValidation(wholeDay);

  exp.getRange(2, 8, N, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(RAMPS, true)
      .setAllowInvalid(false)
      .setHelpText('Leave blank to let the chart assign a colour automatically.')
      .build()
  );

  chr.getRange(2, 3, N, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUSES, true)
      .setAllowInvalid(false)
      .setHelpText('Retired and dead characters keep their history and render faded.')
      .build()
  );

  ros.getRange(2, 1, N, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(exp.getRange('A2:A' + (N + 1)), true)
      .setAllowInvalid(false)
      .build()
  );

  ros.getRange(2, 2, N, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(chr.getRange('A2:A' + (N + 1)), true)
      .setAllowInvalid(true)
      .setHelpText('Pick a known character, or type a new name and add them to the characters tab.')
      .build()
  );
}

function applyConditionalFormats_() {
  var exp = SpreadsheetApp.getActive().getSheetByName('expeditions');
  var range = exp.getRange('A2:H5001');
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($D2<>"",$E2<>"",$E2<$D2)')
    .setBackground('#fbe4e2')
    .setRanges([range])
    .build();
  exp.setConditionalFormatRules([rule]);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

function readTab_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(1, 1, sh.getLastRow(), SCHEMA[name].headers.length).getValues();
  var head = values.shift().map(function (h) {
    return String(h).trim().toLowerCase().replace(/\s+/g, '_');
  });
  return values
    .filter(function (r) { return r.some(function (v) { return String(v).trim() !== ''; }); })
    .map(function (r) {
      var o = {};
      head.forEach(function (h, i) {
        var v = r[i];
        o[h] = (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd')
                                   : String(v).trim();
      });
      return o;
    });
}

function currentDays_() {
  var exps = {};
  readTab_('expeditions').forEach(function (e) { exps[e.id] = Number(e.end_day); });
  var out = {};
  readTab_('roster').forEach(function (r) {
    var end = exps[r.expedition_id];
    if (!isFinite(end)) return;
    if (!(r.character in out) || end > out[r.character]) out[r.character] = end;
  });
  return out;
}

// ---------------------------------------------------------------------------
// Conflict check
// ---------------------------------------------------------------------------

function findConflicts_() {
  var exps = {};
  readTab_('expeditions').forEach(function (e) {
    exps[e.id] = { name: e.name || e.id, s: Number(e.start_day), e: Number(e.end_day) };
  });

  var byChar = {};
  readTab_('roster').forEach(function (r) {
    var x = exps[r.expedition_id];
    if (!x || !isFinite(x.s) || !isFinite(x.e)) return;
    (byChar[r.character] = byChar[r.character] || []).push(x);
  });

  var out = [];
  Object.keys(byChar).forEach(function (name) {
    var list = byChar[name].sort(function (a, b) { return a.s - b.s; });
    for (var i = 0; i < list.length - 1; i++) {
      for (var j = i + 1; j < list.length; j++) {
        var s = Math.max(list[i].s, list[j].s);
        var e = Math.min(list[i].e, list[j].e);
        if (s < e) out.push(name + ': ' + list[i].name + ' and ' + list[j].name +
                            ' overlap on days ' + s + '\u2013' + e);
      }
    }
  });
  return out;
}

function showConflicts() {
  var found = findConflicts_();
  var ui = SpreadsheetApp.getUi();
  if (!found.length) {
    ui.alert('No timeline conflicts', 'Every character is in one place at a time.', ui.ButtonSet.OK);
  } else {
    ui.alert('Timeline conflicts (' + found.length + ')',
             found.join('\n\n') +
             '\n\nFix by correcting whichever day range is wrong in the expeditions tab.',
             ui.ButtonSet.OK);
  }
}

// ---------------------------------------------------------------------------
// Logging dialog
// ---------------------------------------------------------------------------

function showLogDialog() {
  var html = HtmlService.createHtmlOutput(LOG_DIALOG_HTML_)
    .setWidth(440)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, 'Log an expedition');
}

/** Called from the dialog to populate it. */
function getLogContext() {
  var exps = readTab_('expeditions');

  // Codes only need to be unique among expeditions on screen at the same time, so a
  // letter is free again once nothing recent is using it. This never runs out.
  var latest = 0;
  exps.forEach(function (e) { latest = Math.max(latest, Number(e.end_day) || 0); });
  var recent = {};
  exps.forEach(function (e) {
    if (e.code && Number(e.end_day) > latest - 60) recent[e.code.toUpperCase()] = true;
  });

  var code = '';
  for (var i = 0; i < 26; i++) {
    var c = String.fromCharCode(65 + i);
    if (!recent[c]) { code = c; break; }
  }
  if (!code) code = 'A';

  var maxId = 0;
  exps.forEach(function (e) {
    var m = /(\d+)\s*$/.exec(e.id || '');
    if (m) maxId = Math.max(maxId, Number(m[1]));
  });

  var cur = currentDays_();
  var chars = readTab_('characters')
    .filter(function (c) { return (c.status || 'active') === 'active'; })
    .map(function (c) { return { name: c.name, currentDay: cur[c.name] || 0 }; });

  Object.keys(cur).forEach(function (n) {
    if (!chars.some(function (c) { return c.name === n; })) {
      chars.push({ name: n, currentDay: cur[n] });
    }
  });
  chars.sort(function (a, b) { return b.currentDay - a.currentDay || a.name.localeCompare(b.name); });

  return {
    nextId: 'EXP-' + ('00' + (maxId + 1)).slice(-3),
    nextCode: code,
    characters: chars,
    suggestedStart: chars.length ? Math.max.apply(null, chars.map(function (c) { return c.currentDay; })) : 0
  };
}

/**
 * Appends the expedition and its roster rows.
 * Enforces the one invariant: a character may only join an expedition that departs
 * on or after their own current campaign day. Time moves forward; catching up is free.
 */
function submitExpedition(payload) {
  var start = Number(payload.startDay);
  var duration = Number(payload.duration);
  if (!payload.name) throw new Error('Give the expedition a name.');
  if (!isFinite(start) || start < 0) throw new Error('Start day must be a whole number.');
  if (!isFinite(duration) || duration < 1) throw new Error('Duration must be at least 1 day.');
  if (!payload.characters || !payload.characters.length) throw new Error('Pick at least one character.');

  var end = start + duration;
  var cur = currentDays_();

  if (!payload.force) {
    var behind = payload.characters.filter(function (n) { return (cur[n] || 0) > start; });
    if (behind.length) {
      return {
        ok: false,
        blocked: behind.map(function (n) {
          return n + ' is not back until day ' + cur[n];
        }),
        earliest: Math.max.apply(null, payload.characters.map(function (n) { return cur[n] || 0; }))
      };
    }
  }

  var ss = SpreadsheetApp.getActive();
  ss.getSheetByName('expeditions').appendRow([
    payload.id, payload.name, payload.code, start, end,
    payload.dm || '', payload.realDate || '', ''
  ]);
  var ros = ss.getSheetByName('roster');
  payload.characters.forEach(function (n) { ros.appendRow([payload.id, n]); });

  var known = readTab_('characters').map(function (c) { return c.name; });
  var chr = ss.getSheetByName('characters');
  payload.characters.forEach(function (n) {
    if (known.indexOf(n) === -1) chr.appendRow([n, '', 'active', start]);
  });

  return { ok: true, summary: payload.name + ', days ' + start + '\u2013' + end +
                              ', ' + payload.characters.length + ' characters' };
}

// ---------------------------------------------------------------------------
// JSON endpoint (optional). Deploy → New deployment → Web app → Anyone.
// Paste the /exec URL into WEB_APP_URL in index.html. Avoids the 5-minute
// publish-to-web cache, so the chart updates the moment a session is logged.
// ---------------------------------------------------------------------------

function doGet() {
  var payload = {
    expeditions: readTab_('expeditions'),
    roster: readTab_('roster'),
    characters: readTab_('characters'),
    generated: new Date().toISOString()
  };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Demo data — the same seven characters as reference.svg, for checking the wiring.
// ---------------------------------------------------------------------------

function addDemoData() {
  var ss = SpreadsheetApp.getActive();
  ss.getSheetByName('expeditions').getRange(2, 1, 7, 8).setValues([
    ['EXP-A', 'Ashen vale',    'A', 32, 38, 'Kira', '', ''],
    ['EXP-B', 'Hollow barrow', 'B', 35, 41, 'Kira', '', ''],
    ['EXP-C', 'Ruins of Kell', 'C', 44, 51, 'Sam',  '', ''],
    ['EXP-D', 'Saltmire',      'D', 47, 53, 'Sam',  '', ''],
    ['EXP-E', 'Deepwater run', 'E', 58, 66, 'Kira', '', ''],
    ['EXP-F', 'Thornwatch',    'F', 61, 64, 'Ada',  '', ''],
    ['EXP-G', 'Nightmarch',    'G', 70, 78, 'Sam',  '', '']
  ]);

  var pairs = [
    ['EXP-A','Thorne'],['EXP-A','Vex'],['EXP-A','Mira'],
    ['EXP-B','Bramble'],['EXP-B','Sorrel'],['EXP-B','Nettle'],
    ['EXP-C','Thorne'],['EXP-C','Old Grask'],['EXP-C','Sorrel'],
    ['EXP-D','Vex'],['EXP-D','Bramble'],['EXP-D','Old Grask'],
    ['EXP-E','Thorne'],['EXP-E','Mira'],
    ['EXP-F','Bramble'],
    ['EXP-G','Thorne'],['EXP-G','Vex']
  ];
  ss.getSheetByName('roster').getRange(2, 1, pairs.length, 2).setValues(pairs);

  var names = ['Thorne','Vex','Mira','Bramble','Old Grask','Sorrel','Nettle'];
  ss.getSheetByName('characters').getRange(2, 1, names.length, 4).setValues(
    names.map(function (n) { return [n, '', 'active', 30]; })
  );

  SpreadsheetApp.getActive().toast(
    'Demo data added. Old Grask has a deliberate conflict so you can see the red outline.');
}

// ---------------------------------------------------------------------------

var LOG_DIALOG_HTML_ =
'<!DOCTYPE html><html><head><base target="_top"><style>' +
'body{font:14px/1.5 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;margin:0;padding:16px;color:#1a1a19}' +
'label{display:block;font-size:12px;color:#5f5e5a;margin:12px 0 4px}' +
'input[type=text],input[type=number]{width:100%;padding:7px 9px;font:inherit;' +
'border:1px solid #d8d6cf;border-radius:6px;box-sizing:border-box}' +
'.two{display:flex;gap:10px}.two>div{flex:1}' +
'#chars{border:1px solid #d8d6cf;border-radius:6px;max-height:190px;overflow:auto;padding:6px}' +
'#chars label{display:flex;align-items:center;gap:8px;margin:0;padding:4px 6px;font-size:14px;color:#1a1a19}' +
'#chars .day{margin-left:auto;font-size:12px;color:#898781}' +
'.behind{opacity:.55}' +
'button{font:inherit;padding:8px 16px;border-radius:6px;border:1px solid #d8d6cf;' +
'background:#fff;cursor:pointer}button.go{background:#1a1a19;color:#fff;border-color:#1a1a19}' +
'.bar{display:flex;gap:8px;margin-top:16px;align-items:center}' +
'#msg{margin-top:12px;font-size:13px;white-space:pre-wrap}' +
'.err{color:#993c1d}.ok{color:#3b6d11}' +
'</style></head><body>' +
'<label>Expedition name</label><input type="text" id="name" placeholder="Ruins of Kell">' +
'<div class="two">' +
'<div><label>Departs on day</label><input type="number" id="start"></div>' +
'<div><label>Days out</label><input type="number" id="dur" value="6" min="1"></div>' +
'</div>' +
'<div class="two">' +
'<div><label>Bar code</label><input type="text" id="code" maxlength="2"></div>' +
'<div><label>DM</label><input type="text" id="dm"></div>' +
'</div>' +
'<label>Who went</label><div id="chars">Loading…</div>' +
'<div class="bar"><button class="go" id="save">Log expedition</button>' +
'<button id="cancel">Cancel</button></div>' +
'<div id="msg"></div>' +
'<script>' +
'var CTX=null,forced=false;' +
'function esc(s){return String(s).replace(/[&<>"]/g,function(c){' +
'return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});}' +
'function paint(){' +
'document.getElementById("chars").innerHTML=CTX.characters.map(function(c,i){' +
'return \'<label data-day="\'+c.currentDay+\'"><input type="checkbox" value="\'+esc(c.name)+\'">\'+' +
'esc(c.name)+\'<span class="day">d\'+c.currentDay+\'</span></label>\';}).join("")||"No characters yet.";' +
'markBehind();}' +
'function markBehind(){var s=Number(document.getElementById("start").value);' +
'[].forEach.call(document.querySelectorAll("#chars label"),function(l){' +
'l.className=(isFinite(s)&&Number(l.dataset.day)>s)?"behind":"";});}' +
'google.script.run.withSuccessHandler(function(c){CTX=c;' +
'document.getElementById("code").value=c.nextCode;' +
'document.getElementById("start").value=c.suggestedStart;' +
'paint();}).getLogContext();' +
'document.getElementById("start").addEventListener("input",markBehind);' +
'document.getElementById("cancel").onclick=function(){google.script.host.close();};' +
'document.getElementById("save").onclick=function(){' +
'var m=document.getElementById("msg");m.className="";m.textContent="Saving…";' +
'var picked=[].filter.call(document.querySelectorAll("#chars input:checked"),' +
'function(b){return true;}).map(function(b){return b.value;});' +
'google.script.run.withSuccessHandler(function(r){' +
'if(r.ok){m.className="ok";m.textContent="Logged: "+r.summary;' +
'setTimeout(function(){google.script.host.close();},900);return;}' +
'm.className="err";m.textContent="Time only moves forward.\\n\\n"+r.blocked.join("\\n")+' +
'"\\n\\nSet the departure to day "+r.earliest+" or later, or unpick them. ' +
'Press Log expedition again to override.";forced=true;' +
'}).withFailureHandler(function(e){m.className="err";m.textContent=e.message;})' +
'.submitExpedition({id:CTX.nextId,name:document.getElementById("name").value.trim(),' +
'code:document.getElementById("code").value.trim().toUpperCase(),' +
'startDay:document.getElementById("start").value,duration:document.getElementById("dur").value,' +
'dm:document.getElementById("dm").value.trim(),' +
'realDate:new Date().toISOString().slice(0,10),' +
'characters:picked,force:forced});};' +
'<\/script></body></html>';
