/** Persistent cross-list barcode memory. Existing sheets remain unchanged. */
function shoppingAliasKey_(value) {
  var digits = String(value || '').replace(/\D/g, '');
  return digits.length === 13 && digits[0] === '0' ? digits.slice(1) : digits;
}

function shoppingMasterUpcKeys_(value) {
  var digits = shoppingAliasKey_(value);
  var keys = [digits, digits.replace(/^0+/, '')];
  if (digits.length === 12) {
    var core = digits.slice(1, 11);
    keys.push(core, core.replace(/^0+/, ''));
  }
  return keys.filter(Boolean);
}

function shoppingAliasRows_(name, width) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  return sheet && sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getDisplayValues() : [];
}

function shoppingAliasActive_(value) {
  return String(value).toUpperCase() !== 'FALSE';
}

function shoppingMasterChoices_() {
  var choices = {};
  shoppingAliasRows_('Items', 15).forEach(function(row) {
    if (!row[0] || !shoppingAliasActive_(row[8])) return;
    choices[row[0] + ':'] = {
      itemId: row[0], variantId: '', item: row[1], categoryId: row[2],
      unit: row[9] || 'each', upc: row[11]
    };
  });
  shoppingAliasRows_('Item Variants', 10).forEach(function(row) {
    var parent = choices[row[1] + ':'];
    if (!parent || !row[0] || !shoppingAliasActive_(row[9])) return;
    choices[row[1] + ':' + row[0]] = {
      itemId: parent.itemId, variantId: row[0],
      item: parent.item + (row[2] ? ' — ' + row[2] : ''),
      categoryId: parent.categoryId, unit: row[3] || parent.unit, upc: row[5]
    };
  });
  return choices;
}

function webResolveShoppingUpc(upc) {
  var key = shoppingAliasKey_(upc);
  if (!/^\d{6,14}$/.test(key)) throw new Error('Invalid barcode.');
  var choices = shoppingMasterChoices_();
  var matches = {};
  shoppingAliasRows_('UPC Aliases', 5).forEach(function(row) {
    var id = row[1] + ':' + row[2];
    if (shoppingAliasKey_(row[0]) === key && choices[id]) matches[id] = choices[id];
  });
  var source = 'alias';
  if (!Object.keys(matches).length) {
    source = 'master';
    var keys = shoppingMasterUpcKeys_(key);
    Object.keys(choices).forEach(function(id) {
      if (shoppingMasterUpcKeys_(choices[id].upc).some(function(k) { return keys.indexOf(k) >= 0; })) {
        matches[id] = choices[id];
      }
    });
  }
  var products = Object.keys(matches).map(function(id) { return matches[id]; });
  return {success: true, source: source, products: products};
}

/** Caller holds the existing Shopping Mode script lock; never acquire a nested lock. */
function shoppingRememberUpc_(listRow, upc, source) {
  var key = shoppingAliasKey_(upc);
  if (!key) return;
  if (!/^\d{6,14}$/.test(key)) throw new Error('Invalid barcode.');
  var itemId = String(listRow[2] || '').trim();
  var variantId = String(listRow[12] || '').trim();
  if (!shoppingMasterChoices_()[itemId + ':' + variantId]) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('UPC Aliases') || ss.insertSheet('UPC Aliases');
  if (!sheet.getLastRow()) sheet.getRange(1, 1, 1, 5).setValues([['UPC', 'Item_ID', 'Variant_ID', 'Source', 'Updated']]);
  var rows = shoppingAliasRows_('UPC Aliases', 5);
  var index = rows.findIndex(function(row) {
    return shoppingAliasKey_(row[0]) === key && row[1] === itemId && row[2] === variantId;
  });
  var target = index < 0 ? sheet.getLastRow() + 1 : index + 2;
  sheet.getRange(target, 1, 1, 3).setNumberFormat('@');
  sheet.getRange(target, 1, 1, 5).setValues([[key, itemId, variantId, String(source || 'scan'), new Date()]]);
}
