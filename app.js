let ABI;
await fetch('./abi.json').then(r => r.json()).then(a => { ABI = a; });

if (typeof window.ethers === "undefined") {
  alert("Ethers failed to load. Check your network tab or disable extensions for localhost.");
  throw new Error("ethers not loaded");
}

// === Configure your contract here ===
const CONTRACT_ADDRESS = "0xcf73DDcd0b4a7a46e1945CDdFB7a4CA37C6e6e82";
const ABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "setter",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "newValue",
        "type": "uint256"
      }
    ],
    "name": "ValueChanged",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "get",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "newValue",
        "type": "uint256"
      }
    ],
    "name": "set",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

// === DOM handles ===
const netSpan = document.getElementById("net");
const addrSpan = document.getElementById("addr");
const curSpan  = document.getElementById("current");
const btnSet   = document.getElementById("btnSet");
const btnGet   = document.getElementById("btnGet");
const input    = document.getElementById("newValue");

addrSpan.textContent = CONTRACT_ADDRESS;

let provider, signer, contract;

function hexChainName(hex) {
  if (!hex) return "unknown";
  const id = parseInt(hex, 16);
  if (hex === "0xaa36a7" || id === 11155111) return "Sepolia (0xaa36a7)";
  return `Chain ${hex} (${id})`;
}

async function connect() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not detected.");
      return;
    }

    provider = new ethers.BrowserProvider(window.ethereum);

    // Request accounts
    await provider.send("eth_requestAccounts", []);

    // Show current network
    let chainId = await provider.send("eth_chainId", []);
    netSpan.textContent = hexChainName(chainId);

    // Switch to Sepolia if needed
    if (chainId !== "0xaa36a7") {
      try {
        await provider.send("wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }]);
      } catch (err) {
        if (err.code === 4902 || String(err.message||"").includes("4902")) {
          await provider.send("wallet_addEthereumChain", [{
            chainId: "0xaa36a7",
            chainName: "Sepolia",
            nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://rpc.sepolia.org"],
            blockExplorerUrls: ["https://sepolia.etherscan.io/"]
          }]);
        } else {
          console.error("Network switch failed:", err);
          alert("Please switch MetaMask to Sepolia and reload.");
          return;
        }
      }
      chainId = await provider.send("eth_chainId", []);
      netSpan.textContent = hexChainName(chainId);
    }

    signer = await provider.getSigner();
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

    // Initial read
    const v = await contract.get();
    curSpan.textContent = v.toString();

    // Enable buttons
    btnSet.disabled = false;
    btnGet.disabled = false;

    // Live updates & auto-reloads on changes
    contract.on("ValueChanged", (_, v) => { curSpan.textContent = v.toString(); });
    window.ethereum.on?.("accountsChanged", () => location.reload());
    window.ethereum.on?.("chainChanged", () => location.reload());
  } catch (e) {
    console.error("Connect error:", e);
    alert("Could not connect. Open DevTools (F12) → Console for details.");
  }
}

btnSet.onclick = async () => {
  try {
    if (!contract) { alert("Not connected yet."); return; }
    const val = Number(input.value);
    if (!Number.isFinite(val)) { alert("Enter a number"); return; }
    const tx = await contract.set(val);
    await tx.wait();
    alert("Tx mined: " + tx.hash);
  } catch (e) {
    console.error("Set failed:", e);
    alert("Set failed. See console.");
  }
};

btnGet.onclick = async () => {
  try {
    if (!contract) { alert("Not connected yet."); return; }
    const v = await contract.get();
    curSpan.textContent = v.toString();
  } catch (e) {
    console.error("Get failed:", e);
    alert("Get failed. See console.");
  }
};

// Run after DOM is parsed (since we use `defer`)
connect();