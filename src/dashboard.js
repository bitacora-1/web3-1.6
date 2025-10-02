// src/dashboard.js
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.9.0/dist/ethers.esm.min.js";

const CONFIG = {
  tokens: [
    // Reemplaza las direcciones por tus tokens reales
    { symbol: "USDT", address: "0x0000000000000000000000000000000000000000", decimals: 6 },
    { symbol: "DAI", address: "0x0000000000000000000000000000000000000000", decimals: 18 }
  ]
};

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function transfer(address to, uint amount) returns (bool)"
];

let provider = null;
let signer = null;
let account = null;
let network = null;

const el = {
  connectBtn: document.getElementById("connectBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  status: document.getElementById("status"),
  walletInfo: document.getElementById("walletInfo"),
  balancesGrid: document.getElementById("balancesGrid"),
  tokenSelect: document.getElementById("tokenSelect"),
  recipient: document.getElementById("recipient"),
  amount: document.getElementById("amount"),
  sendBtn: document.getElementById("sendBtn"),
  logArea: document.getElementById("logArea")
};

function log(msg){
  const time = new Date().toLocaleTimeString();
  el.logArea.textContent = `[${time}] ${msg}\n` + el.logArea.textContent;
  console.log(msg);
}

function showStatus(text, error=false){
  el.status.textContent = text;
  el.status.style.color = error ? "crimson":"";
}

async function connectWallet(){
  try{
    if(!window.ethereum){ showStatus("MetaMask no detectado", true); return; }

    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    account = await signer.getAddress();
    network = await provider.getNetwork();

    showStatus(`Conectado: ${account}`);
    log(`Conectado a ${network.name} (${network.chainId})`);

    if(window.ethereum.on){
      window.ethereum.on("accountsChanged", async (accs)=>{
        account = accs[0] || null;
        if(!account) disconnectUI();
        else{ await updateWalletInfo(); await refreshBalances(); }
      });
      window.ethereum.on("chainChanged", async ()=>{
        network = await provider.getNetwork();
        await updateWalletInfo();
        await refreshBalances();
      });
    }

    populateTokenSelect();
    await refreshBalances();

  }catch(err){
    console.error(err);
    showStatus("Error conectando wallet: "+err.message, true);
    log("connectWallet error: "+err.message);
  }
}

function disconnectUI(){
  account = signer = provider = null;
  el.walletInfo.innerHTML="No conectado";
  el.balancesGrid.innerHTML="";
  el.tokenSelect.innerHTML=`<option value="ETH">ETH / Native</option>`;
  showStatus("Desconectado");
  log("Usuario desconectado");
}

async function updateWalletInfo(){
  try{
    const balanceBig = await provider.getBalance(account);
    const nativeSymbol = network.name.toLowerCase().includes("polygon")?"MATIC":"ETH";
    const balanceReadable = ethers.formatUnits(balanceBig, 18);
    el.walletInfo.innerHTML = `<div><b>Cuenta:</b> ${shortAddr(account)}</div>
                               <div><b>Red:</b> ${network.name} (${network.chainId})</div>
                               <div><b>Balance:</b> ${balanceReadable} ${nativeSymbol}</div>`;
  }catch(err){
    el.walletInfo.innerText="Error obteniendo info de wallet";
    console.warn(err);
  }
}

function populateTokenSelect(){
  el.tokenSelect.innerHTML=`<option value="ETH">ETH / Native</option>`;
  for(const t of CONFIG.tokens){
    if(!t.address || t.address==="0x0000000000000000000000000000000000000000") continue;
    const opt = document.createElement("option");
    opt.value = t.address;
    opt.textContent = t.symbol;
    el.tokenSelect.appendChild(opt);
  }
}

async function refreshBalances(){
  if(!provider || !account) return;
  try{
    el.balancesGrid.innerHTML="";
    // Native balance
    const balanceNative = await provider.getBalance(account);
    el.balancesGrid.appendChild(makeTokenCell(network.name.toLowerCase().includes("polygon")?"MATIC":"ETH", ethers.formatUnits(balanceNative, 18)));

    for(const t of CONFIG.tokens){
      if(!t.address || t.address==="0x0000000000000000000000000000000000000000") continue;
      try{
        const contract = new ethers.Contract(t.address, ERC20_ABI, provider);
        const balanceRaw = await contract.balanceOf(account);
        const amount = ethers.formatUnits(balanceRaw, t.decimals);
        el.balancesGrid.appendChild(makeTokenCell(t.symbol, amount));
      }catch(e){ console.warn(`Error token ${t.symbol}`, e); el.balancesGrid.appendChild(makeTokenCell(t.symbol,"err")); }
    }
  }catch(err){ console.error(err); log("refreshBalances: "+err.message); }
}

function makeTokenCell(symbol, amount){
  const div = document.createElement("div");
  div.className="tokenCell";
  div.innerHTML=`<div class="tokenSymbol">${symbol}</div><div class="tokenAmount">${amount}</div>`;
  return div;
}

async function sendTx(){
  try{
    if(!signer || !account){ alert("Conecta primero la wallet"); return; }
    const recipient = el.recipient.value.trim();
    const amount = el.amount.value.trim();
    const tokenAddr = el.tokenSelect.value;
    if(!ethers.isAddress(recipient)){ alert("Dirección inválida"); return; }
    if(!amount || isNaN(amount) || Number(amount)<=0){ alert("Cantidad inválida"); return; }

    el.sendBtn.disabled=true;
    showStatus("Preparando transacción...");

    if(token
