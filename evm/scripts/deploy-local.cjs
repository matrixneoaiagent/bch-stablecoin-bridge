/**
 * deploy-local.js — Deploy MockUSDC + BridgeHTLC to local Hardhat node
 * Run: npx hardhat run scripts/deploy-local.js --network localhost
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const USDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();
  console.log("MockUSDC deployed to:", await usdc.getAddress());

  const HTLC = await ethers.getContractFactory("BridgeHTLC");
  const htlc = await HTLC.deploy();
  await htlc.waitForDeployment();
  console.log("BridgeHTLC deployed to:", await htlc.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
