// ---------------------------------------------------------
// app.js — SimpleStorage dApp (clean build, no top-level await)
// ---------------------------------------------------------
console.log("app.js loaded");

// ====== CONFIG ======
const CONTRACT_ADDRESS = "0xcf73DDcd0b4a7a46e1945CDdFB7a4CA37C6e6e82";

// Minimal fallback ABI for SimpleStorage (get, set, ValueChanged)
const FALLBACK_ABI = [
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "internalType": "address", "name": "setter", "type": "address"},
      {"indexed": false, "internalType": "uint256", "name": "newValue", "type": "uint256"}
    ],
    "name": "ValueChanged",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "get",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "newValue","type": "uint256"}],
    "name": "set",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// ====== DOM ======
const netSpan = document.getElementById("net");
const addrSpan = document.getElementById("addr");
const curSpan  = document.getElementById("current");
const btnSet   = document.getElementById("btnSet");
const btnGet   = document.getElementById("btnGet");
const input    = document.getElementById("newValue");
const txSpan   = document.getElementById("txstatus");

if (addrSpan) addrSpan.textContent = CONTRACT_ADDRESS;

// ====== STATE ======
let ABI = null;
let provider, signer, contract;

// ====== HELPERS ======
function chainName(hex) {
  if (!hex) return "unknown";
  const id = parseInt(hex, 16);
  if (hex === "0xaa36a7" || id === 11155111) return "Sepolia (0xaa36a7)";
  return `Chain ${hex} (${id})`;
}

/** Load ABI from ./abi.json (if present), otherwise use FALLBACK_ABI. */
async function loadAbi() {
  try {
    const res = await fetch("./abi.json?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("abi.json fetch " + res.status);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("abi.json is not an array");
    ABI = json;
    console.log("ABI: loaded from abi.json (len:", ABI.length, ")");
  } catch (e) {
    ABI = FALLBACK_ABI;
    console.log("ABI: using fallback (reason:", e.message || e, ")");
  }
}

/** Show network name immediately (MetaMask if available, otherwise read-only). */
async function showNetworkNow() {
  try {
    if (typeof window.ethers === "undefined") {
      netSpan && (netSpan.textContent = "ethers failed to load");
      return;
    }

    // MetaMask present: ask chain id via BrowserProvider
    if (typeof window.ethereum !== "undefined") {
      const p = new ethers.BrowserProvider(window.ethereum);
      const id = await p.send("eth_chainId", []);
      netSpan && (netSpan.textContent = chainName(id));
      return;
    }

    // No MetaMask: read-only Sepolia
    const ro = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
    const id = await ro.send("eth_chainId", []);
    netSpan && (netSpan.textContent = (id === "0xaa36a7" ? "Sepolia (read-only)" : chainName(id)));
  } catch (e) {
    console.warn("showNetworkNow failed:", e);
  }
}

/** Full connect flow with signer + contract (if MetaMask available). */
async function connect() {
  try {
    if (typeof window.ethers === "undefined") {
      throw new Error("ethers not loaded");
    }

    if (typeof window.ethereum === "undefined") {
      // Read-only mode: still show value
      const ro = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
      contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, ro);
      try {
        const v = await contract.get();
        curSpan && (curSpan.textContent = v.toString());
      } catch (e) {
        console.warn("read-only get() failed:", e);
      }
      return;
    }

    // Request accounts & get current chain
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    let chainId = await provider.send("eth_chainId", []);
    netSpan && (netSpan.textContent = chainName(chainId));

    // Ensure Sepolia
    if (chainId !== "0xaa36a7") {
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }]);
      } catch (err) {
        // Add chain if missing
        if (err && (err.code === 4902 || String(err.message||"").includes("4902"))) {
          await provider.send("wallet_addEthereumChain", [{
            chainId: "0xaa36a7",
            chainName: "Sepolia",
            nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io/"]
          }]);
        } else {
          netSpan && (netSpan.textContent = "Please switch to Sepolia");
          console.error("switch failed:", err);
          return;
        }
      }
      chainId = await provider.send("eth_chainId", []);
      netSpan && (netSpan.textContent = chainName(chainId));
    }

    // Signer + contract
    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    // Initial read
    try {
      const v = await contract.get();
      curSpan && (curSpan.textContent = v.toString());
    } catch (e) {
      console.warn("initial get() failed:", e);
    }

    // Enable buttons
    if (btnSet) btnSet.disabled = false;
    if (btnGet) btnGet.disabled = false;

    // Event + wallet listeners
    contract.on?.("ValueChanged", (_, val) => {
      curSpan && (curSpan.textContent = val.toString());
    });
    window.ethereum.on?.("accountsChanged", () => location.reload());
    window.ethereum.on?.("chainChanged", () => location.reload());

  } catch (e) {
    console.error("connect() error:", e);
  }
}

// ====== BUTTONS ======
btnSet && (btnSet.onclick = async () => {
  try {
    if (!contract) { alert("Not connected yet."); return; }
    const val = Number(input.value);
    if (!Number.isFinite(val)) { alert("Enter a number"); return; }

    if (txSpan) txSpan.textContent = "mining…";
    btnSet.disabled = true;

    const tx = await contract.set(val);
    const receipt = await tx.wait();

    if (txSpan) txSpan.textContent = "confirmed ✅";
    alert(`Tx mined: https://sepolia.etherscan.io/tx/${tx.hash} (block ${receipt.blockNumber})`);
  } catch (e) {
    console.error("set() failed:", e);
    if (txSpan) txSpan.textContent = "failed ❌";
    alert("Set failed. Check console for details.");
  } finally {
    btnSet && (btnSet.disabled = false);
  }
});

btnGet && (btnGet.onclick = async () => {
  try {
    if (!contract) { alert("Not connected yet."); return; }
    const v = await contract.get();
    curSpan && (curSpan.textContent = v.toString());
  } catch (e) {
    console.error("get() failed:", e);
    alert("Get failed. See console.");
  }
});

// ====== INIT ======
async function init() {
  // 1) Show a network label ASAP (even before full connect)
  await showNetworkNow();

  // 2) Load ABI (from abi.json if present; else fallback)
  await loadAbi();

  // 3) Full connect (MetaMask if present; else read-only)
  await connect();
}

// Run after full page load
window.addEventListener("load", () => {
  init().catch(e => console.error("init() error:", e));
});