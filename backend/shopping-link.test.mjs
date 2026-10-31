import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function fixture() {
  const elements = new Map();
  const element = () => ({value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,style:{},children:[],
    classList:{add(){},remove(){}},focus(){},appendChild(child){this.children.push(child)}});
  const get = id => {if (!elements.has(id)) elements.set(id,element()); return elements.get(id)};
  const calls = [], timers = [];
  const run = () => {
    let success, failure;
    const builder = new Proxy({}, {get(_, method) {
      if(method === 'withSuccessHandler') return fn => {success=fn;return builder};
      if(method === 'withFailureHandler') return fn => {failure=fn;return builder};
      return (...args) => calls.push({method,args,success,failure});
    }});
    return builder;
  };
  const ctx = vm.createContext({shoppingPendingUpc:'000111222333',shoppingPendingProducts:[],shoppingPendingMasters:[],shoppingPendingMaster:null,
    shoppingLookupGeneration:0,shoppingLookupReady:false,shoppingLinkTimer:null,shoppingLinkRequest:0,shoppingLinkItem:null,shoppingLinkVariants:[],
    selectedList:'Home',document:{getElementById:get,createElement:element},setShoppingStatus(){},loadList(){},showError(){},navigator:{},console,
    setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},
    google:{script:{get run(){return run()}}}});
  const chunks = [
    source.slice(source.indexOf('  function setShoppingMasterCategory('), source.indexOf('  function beginAddScannedShoppingItem(')),
    source.slice(source.indexOf('  function shoppingAddProductChanged('),source.indexOf('  function populateShoppingAddProducts(')),
    source.slice(source.indexOf('  function confirmAddScannedShoppingItem('),source.indexOf('  function showShoppingMatchedItem('))
  ];
  chunks.forEach(chunk => vm.runInContext(chunk, ctx));
  return {ctx,get,calls,timers};
}

test('catalog search ignores stale responses and does not depend on the current list',()=>{
  const {ctx,get,calls,timers}=fixture();
  ctx.openShoppingItemLink();
  get('shoppingLinkSearch').value='milk';ctx.searchShoppingLinkItems();timers.shift()();
  assert.equal(calls[0].method,'webGetRecipeItemChoices');
  assert.deepEqual(Array.from(calls[0].args),['milk']);
  get('shoppingLinkSearch').value='bread';ctx.searchShoppingLinkItems();timers.shift()();
  calls[0].success([{itemId:'old',item:'Milk'}]);
  assert.equal(get('shoppingLinkResults').children.length,0);
  calls[1].success([{itemId:'new',item:'Bread'}]);
  assert.equal(get('shoppingLinkResults').children[0].textContent,'Bread');
});

test('variant must be chosen, then existing IDs are reused and purchase saves the scanned UPC without a price',()=>{
  const {ctx,get,calls}=fixture();
  ctx.chooseShoppingLinkItem({itemId:'I1',item:'Milk'});
  calls[0].success([{variantId:'V1',variant:'Chocolate',defaultUnit:'bottle'}]);
  assert.equal(ctx.shoppingLookupReady,false);
  get('shoppingLinkVariant').value='V1';ctx.shoppingLinkVariantChanged();
  assert.equal(ctx.shoppingPendingMaster.variantId,'V1');
  assert.equal(get('shoppingAddName').value,'Milk — Chocolate');
  assert.equal(get('shoppingAddName').readOnly,true);
  get('shoppingAddCount').value='1';get('shoppingAddPrice').value='';
  ctx.confirmAddScannedShoppingItem();
  assert.equal(calls[1].method,'webAddOrMergeItem');
  assert.equal(calls[1].args[1],'I1');
  assert.equal(calls[1].args[6],'V1');
  calls[1].success({entryId:'E1',success:true});
  assert.equal(calls[2].method,'webShoppingScanPurchase');
  assert.equal(calls[2].args[2],'000111222333');
  assert.equal(calls[2].args[3],null);
  assert.equal(calls.some(call=>call.method==='webCreateAndAddItem'),false);
});

test('switching items invalidates variant responses; failures cannot add a product',()=>{
  const {ctx,calls}=fixture();
  ctx.chooseShoppingLinkItem({itemId:'I1',item:'Milk'});
  ctx.chooseShoppingLinkItem({itemId:'I2',item:'Bread'});
  calls[0].success([{variantId:'V1',variant:'Chocolate'}]);
  assert.equal(ctx.shoppingPendingMaster,null);
  calls[1].failure(new Error('offline'));
  ctx.confirmAddScannedShoppingItem();
  assert.equal(calls.length,2);
  assert.equal(ctx.shoppingLookupReady,false);
});

test('item with no variants can be linked; cancelling invalidates catalog results',()=>{
  const {ctx,get,calls}=fixture();
  ctx.chooseShoppingLinkItem({itemId:'I1',item:'Milk'});
  calls[0].success([]);
  assert.equal(ctx.shoppingLookupReady,true);
  assert.equal(ctx.shoppingPendingMaster.variantId,'');
  ctx.resetShoppingItemLink();
  assert.equal(get('shoppingLinkPanel').hidden,true);
  assert.equal(ctx.shoppingLinkItem,null);
});
