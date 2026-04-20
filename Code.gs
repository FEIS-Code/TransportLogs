// ============================================================
// Transport Logs App — Google Apps Script Backend
// Five Elements International School — Team Garuda
// ============================================================

const SPREADSHEET_ID = '14dZMo9DFW4AIYWLhw_vdJGj0PREttTyR3aUm_hdcI2g';
const PICKUP_SHEET = 'Pickup';
const DROP_SHEET = 'Drop';
const ROUTES_SHEET = 'Routes';
const USERS_SHEET = 'Users';

function getSheet(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === name.trim().toLowerCase()) return sheets[i];
  }
  return null;
}

function sheetToArray(name) {
  var sheet = getSheet(name);
  if (!sheet) return [];
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return [];
  var h = data[0], rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < h.length; j++) obj[h[j]] = data[i][j];
    rows.push(obj);
  }
  return rows;
}

// --- Web App ---

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'all';
  var result;
  switch (action) {
    case 'pickup': result = sheetToArray(PICKUP_SHEET); break;
    case 'drop': result = sheetToArray(DROP_SHEET); break;
    case 'routes': result = getList(ROUTES_SHEET); break;
    case 'stats': result = getStats(); break;
    case 'all': result = {pickup: sheetToArray(PICKUP_SHEET), drop: sheetToArray(DROP_SHEET)}; break;
    default: result = {error:'Unknown'};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'login') {
      return ContentService.createTextOutput(JSON.stringify(login(data.username, data.password))).setMimeType(ContentService.MimeType.JSON);
    }
    var auth = login(data.auth ? data.auth.username : '', data.auth ? data.auth.password : '');
    if (!auth.success || auth.role !== 'admin') {
      return ContentService.createTextOutput(JSON.stringify({success:false,message:'Unauthorized'})).setMimeType(ContentService.MimeType.JSON);
    }
    var result;
    switch (data.action) {
      case 'logPickup': result = logPickup(data); break;
      case 'logDrop': result = logDrop(data); break;
      case 'deleteLog': result = deleteLog(data); break;
      case 'saveRoutes': result = saveList(ROUTES_SHEET, 'Route', data.items); break;
      case 'setupData': setupData(); result = {success:true}; break;
      default: result = {error:'Unknown action'};
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false,error:err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

// --- Pickup Log ---

function logPickup(data) {
  var sheet = getSheet(PICKUP_SHEET);
  if (!sheet) return {success:false, message:'Sheet not found'};
  var id = 'PK-' + Date.now().toString(36).toUpperCase();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy');
  var hasDelay = (data.delay === 'Yes' || data.delay === true) ? 'Yes' : 'No';
  sheet.appendRow([id, today, data.route||'', parseInt(data.students)||0, data.busArrival||'', hasDelay, data.delayDuration||'', data.delayReason||'', data.notes||'']);
  return {success:true, id:id};
}

// --- Drop Log ---

function logDrop(data) {
  var sheet = getSheet(DROP_SHEET);
  if (!sheet) return {success:false, message:'Sheet not found'};
  var id = 'DR-' + Date.now().toString(36).toUpperCase();
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy');
  var hasDelay = (data.delay === 'Yes' || data.delay === true) ? 'Yes' : 'No';
  sheet.appendRow([id, today, data.route||'', parseInt(data.students)||0, data.departureTime||'', data.returnTime||'', hasDelay, data.delayDuration||'', data.delayReason||'', data.notes||'']);
  return {success:true, id:id};
}

// --- Delete ---

function deleteLog(data) {
  var sheetName = data.type === 'pickup' ? PICKUP_SHEET : DROP_SHEET;
  var sheet = getSheet(sheetName);
  if (!sheet) return {success:false};
  var all = sheet.getDataRange().getDisplayValues();
  for (var i = 1; i < all.length; i++) {
    if (all[i][0] === data.id) { sheet.deleteRow(i+1); return {success:true}; }
  }
  return {success:false, message:'Not found'};
}

// --- Stats ---

function getStats() {
  var pickups = sheetToArray(PICKUP_SHEET);
  var drops = sheetToArray(DROP_SHEET);
  var pDelays = pickups.filter(function(r){return r.Delay==='Yes';}).length;
  var dDelays = drops.filter(function(r){return r.Delay==='Yes';}).length;
  var routeCount = {};
  pickups.forEach(function(r){var rt=r.Route||'?'; routeCount[rt]=(routeCount[rt]||0)+1;});
  drops.forEach(function(r){var rt=r.Route||'?'; routeCount[rt]=(routeCount[rt]||0)+1;});
  return {totalPickups:pickups.length, totalDrops:drops.length, pickupDelays:pDelays, dropDelays:dDelays, routes:routeCount};
}

// --- Helpers ---

function getList(sheetName) {
  var sheet = getSheet(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getDisplayValues();
  var r = [];
  for (var i = 1; i < data.length; i++) if (data[i][0]) r.push(data[i][0].trim());
  return r;
}

function saveList(sheetName, header, items) {
  var sheet = getSheet(sheetName) || SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet(sheetName);
  sheet.clear(); sheet.appendRow([header]);
  (items||[]).forEach(function(v){sheet.appendRow([v]);});
  return {success:true};
}

function login(username, password) {
  var sheet = getSheet(USERS_SHEET);
  if (!sheet) return {success:false, message:'Users sheet not found'};
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim()===String(username).trim() && String(data[i][1]).trim()===String(password).trim())
      return {success:true, role:String(data[i][2]).trim(), displayName:String(data[i][3]).trim(), username:String(data[i][0]).trim()};
  }
  return {success:false, message:'Invalid credentials'};
}

// --- Setup ---

function setupData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var us = ss.getSheetByName(USERS_SHEET)||ss.insertSheet(USERS_SHEET); us.clear();
  us.appendRow(['Username','Password','Role','DisplayName']);
  us.appendRow(['admin','admin123','admin','Administrator']);
  us.appendRow(['ramakrishna','teach123','admin','Mr. Rama Krishna']);

  var rs = ss.getSheetByName(ROUTES_SHEET)||ss.insertSheet(ROUTES_SHEET); rs.clear();
  rs.appendRow(['Route']);
  ['Route 1','Route 2','Route 3','Route 4','Route 5','Route 6','Route 7','Route 8'].forEach(function(r){rs.appendRow([r]);});

  var ps = ss.getSheetByName(PICKUP_SHEET)||ss.insertSheet(PICKUP_SHEET); ps.clear();
  ps.appendRow(['ID','Date','Route','Students','BusArrival','Delay','DelayDuration','DelayReason','Notes']);

  var ds = ss.getSheetByName(DROP_SHEET)||ss.insertSheet(DROP_SHEET); ds.clear();
  ds.appendRow(['ID','Date','Route','Students','DepartureTime','ReturnTime','Delay','DelayDuration','DelayReason','Notes']);

  Logger.log('Setup complete');
}
