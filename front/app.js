// front/app.js
// Implémentation pour le membre 4 — connexion avec ethers.js
// Attendu : un fichier HTML avec des éléments portant les ids utilisés ci-dessous

// Usage :
// - Fournir l'adresse du contrat dans l'input #contractAddress ou modifier la variable par défaut
// - Cliquer "Connect" pour connecter MetaMask
// - Utiliser les boutons/formulaires pour contribute/withdraw/refund

let provider, signer, contract;
let contractAddress = '';

// Par défaut on tente de récupérer l'ABI depuis /build/... (peut être adapté)
const DEFAULT_ABI_PATH = '/build/contracts_Crowdfunding_sol_Crowdfunding.abi';
let contractAbi = null;

// IDs attendus dans le HTML (exemples) :
// #connectButton, #connectedAddress, #contractAddress, #loadContractButton
// #goal, #totalRaised, #deadline, #status, #userContribution
// #contributeAmount, #contributeButton, #withdrawButton, #refundButton
// #messageArea, #refreshButton

function logMessage(msg, type = 'info') {
  const el = document.getElementById('messageArea');
  if (!el) {
    console[type === 'error' ? 'error' : 'log']('[app] ' + msg);
    return;
  }
  const p = document.createElement('div');
  p.textContent = msg;
  p.className = 'msg ' + type;
  el.prepend(p);
}

function clearMessages() {
  const el = document.getElementById('messageArea');
  if (el) el.innerHTML = '';
}

async function fetchAbi(path = DEFAULT_ABI_PATH) {
  try {
    const res = await fetch(path, {cache: 'no-store'});
    if (!res.ok) throw new Error('ABI fetch failed: ' + res.status);
    const text = await res.text();
    // ABI file may be plain JSON or already stringified array
    try {
      return JSON.parse(text);
    } catch (err) {
      // if not JSON, assume it's already an ABI array in string format
      return JSON.parse(text);
    }
  } catch (err) {
    logMessage('Impossible de charger l\'ABI depuis ' + path + ' — ' + err.message, 'error');
    return null;
  }
}

async function connectMetaMask() {
  if (!window.ethereum) {
    logMessage('MetaMask non détecté. Installez MetaMask et réessayez.', 'error');
    return;
  }
  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();
    const address = await signer.getAddress();
    const addrEl = document.getElementById('connectedAddress');
    if (addrEl) addrEl.textContent = address;
    logMessage('Connecté en tant que ' + address, 'success');
    // If contract address field exists, update
    const ca = document.getElementById('contractAddress');
    if (ca && ca.value) contractAddress = ca.value.trim();
    await loadAbiAndContract();
  } catch (err) {
    logMessage('Connexion échouée: ' + err.message, 'error');
  }
}

async function loadAbiAndContract() {
  if (!contractAddress) {
    const ca = document.getElementById('contractAddress');
    if (ca) contractAddress = ca.value.trim();
  }
  if (!contractAddress) {
    logMessage('Adresse du contrat non fournie. Saisissez-la dans #contractAddress.', 'error');
    return;
  }
  if (!contractAbi) {
    contractAbi = await fetchAbi();
    if (!contractAbi) return;
  }
  try {
    contract = new ethers.Contract(contractAddress, contractAbi, signer || provider);
    logMessage('Instance du contrat créée: ' + contractAddress, 'success');
    attachContractEvents();
    await refreshAll();
  } catch (err) {
    logMessage('Erreur création instance contrat: ' + err.message, 'error');
  }
}

function attachContractEvents() {
  if (!contract) return;
  // Écoute des événements si présents
  try {
    contract.on('Contributed', (contributor, amount, event) => {
      logMessage(`Contributed: ${contributor} • ${formatEther(amount)} ETH`, 'info');
      refreshAll();
    });
    contract.on('Withdrawn', (receiver, amount, event) => {
      logMessage(`Withdrawn: ${receiver} • ${formatEther(amount)} ETH`, 'info');
      refreshAll();
    });
    contract.on('Refunded', (from, amount, event) => {
      logMessage(`Refunded: ${from} • ${formatEther(amount)} ETH`, 'info');
      refreshAll();
    });
  } catch (err) {
    // Certains contracts peuvent ne pas exposer ces événements — ok
  }
}

function formatEther(bn) {
  try {
    return ethers.utils.formatEther(bn);
  } catch (err) {
    return bn.toString();
  }
}

function formatTimestamp(ts) {
  try {
    const n = Number(ts);
    if (n === 0) return '—';
    const d = new Date(n * 1000);
    return d.toLocaleString();
  } catch (err) {
    return ts.toString();
  }
}

async function readContractValue(name, ...args) {
  if (!contract) throw new Error('Contrat non initialisé');
  if (typeof contract[name] !== 'function') throw new Error('Méthode ' + name + ' introuvable dans le contrat');
  return await contract[name](...args);
}

async function refreshAll() {
  clearMessages();
  if (!contract) return;
  try {
    // lecture courante
    let goal = await safeCall('goal');
    let deadline = await safeCall('deadline');
    let totalRaised = await safeCall('totalRaised');
    // contribution de l'utilisateur
    let userAddr = signer ? await signer.getAddress() : null;
    let userContribution = null;
    if (userAddr) {
      userContribution = await safeCall('contributions', userAddr);
      if (userContribution === null) {
        // try alternate name
        userContribution = await safeCall('contributionOf', userAddr);
      }
    }

    // afficher
    const elGoal = document.getElementById('goal');
    if (elGoal) elGoal.textContent = goal ? formatEther(goal) + ' ETH' : '—';
    const elTotal = document.getElementById('totalRaised');
    if (elTotal) elTotal.textContent = totalRaised ? formatEther(totalRaised) + ' ETH' : '—';
    const elDeadline = document.getElementById('deadline');
    if (elDeadline) elDeadline.textContent = deadline ? formatTimestamp(deadline) : '—';
    const elUser = document.getElementById('userContribution');
    if (elUser) elUser.textContent = userContribution ? formatEther(userContribution) + ' ETH' : '0 ETH';

    // statut basique
    const elStatus = document.getElementById('status');
    if (elStatus) {
      const now = Math.floor(Date.now() / 1000);
      let status = 'Inconnu';
      if (deadline) {
        if (Number(totalRaised || 0) >= Number(goal || 0)) status = 'Objectif atteint';
        else if (now < Number(deadline)) status = 'En cours';
        else status = 'Terminé (objectif non atteint)';
      }
      elStatus.textContent = status;
    }
  } catch (err) {
    logMessage('Erreur lecture contrat: ' + err.message, 'error');
  }
}

async function safeCall(fnName, ...args) {
  try {
    if (!contract) return null;
    if (typeof contract[fnName] !== 'function') return null;
    return await contract[fnName](...args);
  } catch (err) {
    return null;
  }
}

async function contribute(amountEth) {
  if (!contract) return logMessage('Contrat non initialisé', 'error');
  if (!signer) return logMessage('Connectez MetaMask d\'abord', 'error');
  try {
    const val = ethers.utils.parseEther(amountEth.toString());
    const tx = await contract.connect(signer).contribute({ value: val });
    logMessage('Transaction envoyée: ' + tx.hash, 'info');
    await tx.wait();
    logMessage('Contribution confirmée', 'success');
    await refreshAll();
  } catch (err) {
    logMessage('Contribution échouée: ' + (err.data?.message || err.message), 'error');
  }
}

async function withdraw() {
  if (!contract) return logMessage('Contrat non initialisé', 'error');
  if (!signer) return logMessage('Connectez MetaMask d\'abord', 'error');
  try {
    const tx = await contract.connect(signer).withdraw();
    logMessage('Withdrawal tx envoyée: ' + tx.hash, 'info');
    await tx.wait();
    logMessage('Withdrawal confirmé', 'success');
    await refreshAll();
  } catch (err) {
    logMessage('Withdraw échoué: ' + (err.data?.message || err.message), 'error');
  }
}

async function refund() {
  if (!contract) return logMessage('Contrat non initialisé', 'error');
  if (!signer) return logMessage('Connectez MetaMask d\'abord', 'error');
  try {
    const tx = await contract.connect(signer).refund();
    logMessage('Refund tx envoyée: ' + tx.hash, 'info');
    await tx.wait();
    logMessage('Refund confirmé', 'success');
    await refreshAll();
  } catch (err) {
    logMessage('Refund échoué: ' + (err.data?.message || err.message), 'error');
  }
}

function setupUiListeners() {
  const connectBtn = document.getElementById('connectButton');
  if (connectBtn) connectBtn.addEventListener('click', connectMetaMask);
  const loadBtn = document.getElementById('loadContractButton');
  if (loadBtn) loadBtn.addEventListener('click', async () => {
    const ca = document.getElementById('contractAddress');
    if (ca) contractAddress = ca.value.trim();
    await loadAbiAndContract();
  });

  const refreshBtn = document.getElementById('refreshButton');
  if (refreshBtn) refreshBtn.addEventListener('click', refreshAll);

  const contributeBtn = document.getElementById('contributeButton');
  if (contributeBtn) contributeBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const a = document.getElementById('contributeAmount');
    if (!a || !a.value) return logMessage('Saisissez un montant', 'error');
    await contribute(a.value);
  });

  const withdrawBtn = document.getElementById('withdrawButton');
  if (withdrawBtn) withdrawBtn.addEventListener('click', async () => await withdraw());

  const refundBtn = document.getElementById('refundButton');
  if (refundBtn) refundBtn.addEventListener('click', async () => await refund());
}

window.addEventListener('load', () => {
  // Vérifier si ethers est présent
  if (typeof ethers === 'undefined') {
    logMessage('La librairie ethers.js est requise. Ajoutez <script src="https://cdn.jsdelivr.net/npm/ethers/dist/ethers.min.js"></script> dans votre HTML.', 'error');
  }
  setupUiListeners();
});

// Expose some helpers pour debug dans la console
window.app = {
  connectMetaMask,
  loadAbiAndContract,
  refreshAll,
  contribute,
  withdraw,
  refund,
};

