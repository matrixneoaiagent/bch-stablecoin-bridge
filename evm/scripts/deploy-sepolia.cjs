/**
 * deploy-sepolia.js — Deploy MockUSDC + BridgeHTLC to Base Sepolia
 * Requires .env with EVM_PRIVATE_KEY and BASE_SEPOLIA_RPC
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying to Base Sepolia with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("ETH balance:", ethers.formatEther(balance));

  const USDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log("MockUSDC:", usdcAddr);
  console.log("Explorer:", `https://sepolia.basescan.org/address/${usdcAddr}`);

  const HTLC = await ethers.getContractFactory("BridgeHTLC");
  const htlc = await HTLC.deploy();
  await htlc.waitForDeployment();
  const htlcAddr = await htlc.getAddress();
  console.log("BridgeHTLC:", htlcAddr);
  console.log("Explorer:", `https://sepolia.basescan.org/address/${htlcAddr}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
