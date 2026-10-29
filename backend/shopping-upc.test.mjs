import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture() {
  const tables = {
    Items: [['I1','Milk','C1','','','','','','TRUE','gallon','','4856406700','','','TRUE']],
    'Item Variants': [['V1','I1','Chocolate','bottle','','012345678905','','','TRUE','TRUE']],
    'UPC Aliases': []
  };
  const sheets = Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, {
    getLastRow: () => rows.length + 1,
    getRange: (r,c,n=1,w=1) => ({
      getDisplayValues: () => rows.slice(r-2,r-2+n).map(row => row.slice(c-1,c-1+w)),
      setNumberFormat: () => {},
      setValues: values => { for(let i=0;i<values.length;i++) rows[r-2+i]=values[i]; }
    })
  }]));
  const ctx = vm.createContext({SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:name=>sheets[name]})}});
  vm.runInContext(fs.readFileSync(new URL('ShoppingUpcAliases.gs',import.meta.url),'utf8'),ctx);
  return {ctx,tables};
}

test('master UPC cores and variant UPCs resolve with original IDs',()=>{
  const {ctx}=fixture();
  assert.equal(ctx.webResolveShoppingUpc('048564067008').products[0].itemId,'I1');
  const variant=ctx.webResolveShoppingUpc('0012345678905').products[0];
  assert.equal(variant.variantId,'V1');
  assert.equal(variant.unit,'bottle');
});
test('aliases preserve leading zero, survive off-list lookup and update without duplication',()=>{
  const {ctx,tables}=fixture();
  const row=['E','W','I1','','','','','','','','','','V1'];
  ctx.shoppingRememberUpc_(row,'000111222333', 'scan');
  ctx.shoppingRememberUpc_(row,'0000111222333', 'scan');
  assert.equal(tables['UPC Aliases'].length,1);
  assert.equal(tables['UPC Aliases'][0][0],'000111222333');
  assert.equal(ctx.webResolveShoppingUpc('000111222333').products[0].variantId,'V1');
});
test('inactive products are excluded; ambiguous aliases are returned for confirmation',()=>{
  const {ctx,tables}=fixture();
  tables['UPC Aliases'].push(['000111222333','I1',''],['000111222333','I1','V1']);
  assert.equal(ctx.webResolveShoppingUpc('000111222333').products.length,2);
  tables['Item Variants'][0][9]='FALSE';
  assert.equal(ctx.webResolveShoppingUpc('000111222333').products.length,1);
  tables.Items[0][8]='FALSE';
  assert.equal(ctx.webResolveShoppingUpc('000111222333').products.length,0);
});

test('frontend checks saved products before Kroger and ignores cancelled lookups',()=>{
  const source=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('  function beginAddScannedShoppingItem('),source.indexOf('  function confirmAddScannedShoppingItem('));
  const elements=new Map();
  const element=()=>({value:'',innerHTML:'',textContent:'',classList:{add(){},remove(){}},appendChild(){}});
  const calls=[];
  let success;
  const runner={withSuccessHandler(f){success=f;return this},withFailureHandler(){return this},
    webResolveShoppingUpc(upc){calls.push(['saved',upc,success])},webSearchKrogerProducts(upc){calls.push(['kroger',upc,success])}};
  const ctx=vm.createContext({shoppingPendingUpc:'',shoppingPendingProducts:[],shoppingPendingMasters:[],shoppingPendingMaster:null,shoppingLookupGeneration:0,
    document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id)},createElement:element},
    populateShoppingAddCategories(){},setShoppingStatus(){},shoppingUpcCandidates:()=>[],google:{script:{run:runner}},console});
  vm.runInContext(fn,ctx);
  ctx.beginAddScannedShoppingItem('123456789012');
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'saved');
  calls[0][2]({success:true,products:[]});
  assert.equal(calls[1][0],'kroger');
  ctx.shoppingLookupGeneration++;
  calls[1][2]({success:true,products:[{description:'stale'}]});
  assert.equal(ctx.shoppingPendingProducts.length,0);
});
