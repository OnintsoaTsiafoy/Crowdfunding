// front/app.js — connexion MetaMask via ethers.js v5

let provider, signer, contract;
let contractAddress = '';
let currentUserAddress = null;

// ABI embarqué directement (extrait du build)
const CONTRACT_ABI = [
  {"inputs":[{"internalType":"uint256","name":"_goal","type":"uint256"},{"internalType":"uint256","name":"_durationInDays","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"contributor","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Contributed","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"contributor","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Refunded","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Withdrawn","type":"event"},
  {"inputs":[],"name":"contribute","outputs":[],"stateMutability":"payable","type":"function"},
  {"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"contributions","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"deadline","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getCampaignInfo","outputs":[{"internalType":"address","name":"campaignOwner","type":"address"},{"internalType":"uint256","name":"campaignGoal","type":"uint256"},{"internalType":"uint256","name":"campaignDeadline","type":"uint256"},{"internalType":"uint256","name":"raised","type":"uint256"},{"internalType":"uint256","name":"contractBalance","type":"uint256"},{"internalType":"bool","name":"goalReached","type":"bool"},{"internalType":"bool","name":"campaignEnded","type":"bool"},{"internalType":"bool","name":"fundsWithdrawn","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"goal","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"refund","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"totalRaised","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"withdrawn","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"}
];

// ─── Messages ─────────────────────────────────────────────────────────────────

function logMessage(msg, type = 'info') {
  console[type === 'error' ? 'error' : 'log']('[app] ' + msg);
  const el = document.getElementById('messageArea');
  if (!el) return;
  // Rendre la carte logs visible dès le premier message
  const card = document.getElementById('logsCard');
  if (card) card.style.display = '';
  const div = document.createElement('div');
  div.textContent = msg;
  div.className = 'msg ' + type;
  el.prepend(div);
}

function clearMessages() {
  const el = document.getElementById('messageArea');
  if (el) el.innerHTML = '';
}

// ─── Connexion MetaMask ────────────────────────────────────────────────────────

async function connectMetaMask() {
  if (!window.ethereum) {
    logMessage('MetaMask non détecté. Installez MetaMask et réessayez.', 'error');
    return;
  }
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    currentUserAddress = await signer.getAddress();

    const addrEl = document.getElementById('connectedAddress');
    if (addrEl) addrEl.textContent = currentUserAddress;

    const connectBtn = document.getElementById('connectButton');
    if (connectBtn) {
      connectBtn.textContent = 'Connecté';
      connectBtn.disabled = true;
    }

    logMessage('Connecté : ' + currentUserAddress, 'success');

    const ca = document.getElementById('contractAddress');
    if (ca && ca.value.trim()) {
      contractAddress = ca.value.trim();
      await initContract();
    }
  } catch (err) {
    logMessage('Connexion échouée : ' + err.message, 'error');
  }
}

// ─── Chargement du contrat ─────────────────────────────────────────────────────

async function initContract() {
  const ca = document.getElementById('contractAddress');
  if (ca && ca.value.trim()) contractAddress = ca.value.trim();

  if (!contractAddress) {
    alert('Saisissez l\'adresse du contrat déployé.');
    return;
  }

  // Si MetaMask n'est pas encore connecté, on crée un provider en lecture seule
  if (!provider) {
    if (window.ethereum) {
      provider = new ethers.providers.Web3Provider(window.ethereum);
    } else {
      alert('MetaMask non détecté. Installez MetaMask pour interagir avec le contrat.');
      return;
    }
  }

  // S'assurer qu'on est sur Sepolia
  const switched = await switchToSepolia();
  if (!switched) return;
  // Recréer le provider après le changement de réseau
  provider = new ethers.providers.Web3Provider(window.ethereum);
  if (signer) signer = provider.getSigner();

  try {
    await showNetwork();
    contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer || provider);
    logMessage('Contrat chargé : ' + contractAddress, 'success');
    attachContractEvents();
    await refreshAll();
  } catch (err) {
    logMessage('Erreur initialisation contrat : ' + err.message, 'error');
    alert('Erreur : ' + err.message);
  }
}

// ─── Écoute des événements ─────────────────────────────────────────────────────

function attachContractEvents() {
  if (!contract) return;
  try {
    contract.removeAllListeners();
    contract.on('Contributed', (contributor, amount) => {
      logMessage('Contributed : ' + contributor + ' — ' + fmt(amount) + ' ETH', 'info');
      refreshAll();
    });
    contract.on('Withdrawn', (recipient, amount) => {
      logMessage('Withdrawn : ' + recipient + ' — ' + fmt(amount) + ' ETH', 'info');
      refreshAll();
    });
    contract.on('Refunded', (contributor, amount) => {
      logMessage('Refunded : ' + contributor + ' — ' + fmt(amount) + ' ETH', 'info');
      refreshAll();
    });
  } catch (_) {}
}

// ─── Réseau ───────────────────────────────────────────────────────────────────

const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111

async function switchToSepolia() {
  if (!window.ethereum) {
    alert('MetaMask non détecté.');
    return false;
  }
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
    return true;
  } catch (err) {
    // Le réseau n'est pas encore ajouté dans MetaMask → on l'ajoute
    if (err.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: SEPOLIA_CHAIN_ID,
            chainName: 'Sepolia Testnet',
            nativeCurrency: { name: 'SepoliaETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://rpc.sepolia.org'],
            blockExplorerUrls: ['https://sepolia.etherscan.io'],
          }],
        });
        return true;
      } catch (addErr) {
        logMessage('Impossible d\'ajouter Sepolia : ' + addErr.message, 'error');
        return false;
      }
    }
    logMessage('Changement de réseau annulé.', 'error');
    return false;
  }
}

async function showNetwork() {
  if (!provider) return;
  try {
    const network = await provider.getNetwork();
    const names = {
      1:        'Mainnet',
      11155111: 'Sepolia ✓',
      5:        'Goerli',
      137:      'Polygon',
      80001:    'Mumbai',
      1337:     'Localhost',
      31337:    'Hardhat',
    };
    const name = names[network.chainId] || network.name || ('Chain ' + network.chainId);
    setText('networkName', name);
    setText('chainId', String(network.chainId));
    // Avertissement si pas sur Sepolia
    const el = document.getElementById('networkName');
    if (el) el.style.color = network.chainId === 11155111 ? '#22c55e' : '#ef4444';
  } catch (_) {}
}

// ─── Lecture de l'état ─────────────────────────────────────────────────────────

async function refreshAll() {
  if (!contract) return;
  try {
    const info = await contract.getCampaignInfo();
    const {
      campaignOwner,
      campaignGoal,
      campaignDeadline,
      raised,
      contractBalance,
      goalReached,
      campaignEnded,
    } = info;

    setText('goal',           fmt(campaignGoal) + ' ETH');
    setText('totalRaised',    fmt(raised) + ' ETH');
    setText('contractBalance',fmt(contractBalance) + ' ETH');
    setText('deadline',       fmtDate(campaignDeadline));

    // Statut
    const statusEl = document.getElementById('status');
    if (statusEl) {
      if (goalReached) {
        statusEl.textContent = 'Objectif atteint ✓';
        statusEl.style.color = '#22c55e';
      } else if (!campaignEnded) {
        statusEl.textContent = 'En cours';
        statusEl.style.color = '#f97316';
      } else {
        statusEl.textContent = 'Terminé (objectif non atteint)';
        statusEl.style.color = '#ef4444';
      }
    }

    // Barre de progression
    const goalWei = campaignGoal.gt(0) ? campaignGoal : ethers.BigNumber.from(1);
    const pct = Math.min(100, Math.floor(raised.mul(100).div(goalWei).toNumber()));
    const fill = document.getElementById('progressBarFill');
    if (fill) fill.style.width = pct + '%';
    setText('progressLabel', pct + '%');

    // Contribution de l'utilisateur courant
    if (currentUserAddress && contract) {
      try {
        const userContrib = await contract.contributions(currentUserAddress);
        setText('userContribution', fmt(userContrib) + ' ETH');
      } catch (_) {
        setText('userContribution', '0 ETH');
      }
    }

    // Badge propriétaire
    const ownerBadge = document.getElementById('ownerBadge');
    if (ownerBadge && currentUserAddress) {
      const isOwner = campaignOwner.toLowerCase() === currentUserAddress.toLowerCase();
      ownerBadge.style.display = isOwner ? 'block' : 'none';
    }
  } catch (err) {
    if (err.code === 'CALL_EXCEPTION') {
      logMessage('Contrat introuvable sur ce réseau. Vérifiez le réseau dans MetaMask et l\'adresse du contrat.', 'error');
    } else {
      logMessage('Erreur lecture contrat : ' + err.message, 'error');
    }
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

async function contribute(amountEth) {
  if (!contract) return logMessage('Contrat non initialisé.', 'error');
  if (!signer)   return logMessage('Connectez MetaMask d\'abord.', 'error');
  try {
    const val = ethers.utils.parseEther(String(amountEth));
    const tx  = await contract.connect(signer).contribute({ value: val });
    logMessage('Transaction envoyée : ' + tx.hash, 'info');
    await tx.wait();
    logMessage('Contribution confirmée !', 'success');
    await refreshAll();
  } catch (err) {
    logMessage('Contribution échouée : ' + extractError(err), 'error');
  }
}

async function withdraw() {
  if (!contract) return logMessage('Contrat non initialisé.', 'error');
  if (!signer)   return logMessage('Connectez MetaMask d\'abord.', 'error');
  try {
    const tx = await contract.connect(signer).withdraw();
    logMessage('Withdraw tx envoyée : ' + tx.hash, 'info');
    await tx.wait();
    logMessage('Withdraw confirmé !', 'success');
    await refreshAll();
  } catch (err) {
    logMessage('Withdraw échoué : ' + extractError(err), 'error');
  }
}

async function refund() {
  if (!contract) return logMessage('Contrat non initialisé.', 'error');
  if (!signer)   return logMessage('Connectez MetaMask d\'abord.', 'error');
  try {
    const tx = await contract.connect(signer).refund();
    logMessage('Refund tx envoyée : ' + tx.hash, 'info');
    await tx.wait();
    logMessage('Refund confirmé !', 'success');
    await refreshAll();
  } catch (err) {
    logMessage('Refund échoué : ' + extractError(err), 'error');
  }
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function fmt(bn) {
  try { return ethers.utils.formatEther(bn); } catch (_) { return String(bn); }
}

function fmtDate(ts) {
  try {
    const n = Number(ts);
    if (n === 0) return '—';
    return new Date(n * 1000).toLocaleString();
  } catch (_) { return String(ts); }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function extractError(err) {
  return err?.data?.message || err?.reason || err?.message || String(err);
}

// ─── Listeners UI ─────────────────────────────────────────────────────────────

function setupUiListeners() {
  document.getElementById('connectButton')
    ?.addEventListener('click', connectMetaMask);

  document.getElementById('switchSepoliaButton')
    ?.addEventListener('click', async () => {
      await switchToSepolia();
      if (provider) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        if (signer) signer = provider.getSigner();
        await showNetwork();
      }
    });

  document.getElementById('loadContractButton')
    ?.addEventListener('click', initContract);

  document.getElementById('refreshButton')
    ?.addEventListener('click', refreshAll);

  document.getElementById('contributeButton')
    ?.addEventListener('click', async (e) => {
      e.preventDefault();
      const a = document.getElementById('contributeAmount');
      if (!a || !a.value) return logMessage('Saisissez un montant.', 'error');
      await contribute(a.value);
    });

  document.getElementById('withdrawButton')
    ?.addEventListener('click', withdraw);

  document.getElementById('refundButton')
    ?.addEventListener('click', refund);
}

// ─── Changement de compte / réseau MetaMask ────────────────────────────────────

function listenMetaMaskChanges() {
  if (!window.ethereum) return;

  window.ethereum.on('accountsChanged', async (accounts) => {
    if (accounts.length === 0) {
      currentUserAddress = null;
      setText('connectedAddress', 'Non connecté');
      const btn = document.getElementById('connectButton');
      if (btn) { btn.textContent = 'Connecter MetaMask'; btn.disabled = false; }
      logMessage('MetaMask déconnecté.', 'error');
    } else {
      currentUserAddress = accounts[0];
      setText('connectedAddress', currentUserAddress);
      provider = new ethers.providers.Web3Provider(window.ethereum);
      signer   = provider.getSigner();
      logMessage('Compte changé : ' + currentUserAddress, 'info');
      if (contract) await refreshAll();
    }
  });

  window.ethereum.on('chainChanged', () => {
    logMessage('Réseau changé — rechargement…', 'info');
    window.location.reload();
  });
}

// ─── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
  if (typeof ethers === 'undefined') {
    logMessage('ethers.js introuvable. Vérifiez votre connexion internet.', 'error');
    return;
  }
  setupUiListeners();
  listenMetaMaskChanges();
});

// Helpers accessibles depuis la console du navigateur
window.app = { connectMetaMask, initContract, refreshAll, contribute, withdraw, refund };
