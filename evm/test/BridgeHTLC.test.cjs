const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("BridgeHTLC + MockUSDC", function () {
  let htlc, usdc;
  let initiator, recipient, other;

  // A known secret/hashlock pair
  const SECRET = ethers.encodeBytes32String("test-secret-bridge-2026");
  const HASHLOCK = ethers.sha256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [SECRET]));

  const AMOUNT = ethers.parseUnits("100", 6); // 100 mUSDC

  beforeEach(async () => {
    [initiator, recipient, other] = await ethers.getSigners();

    // Deploy MockUSDC
    const USDC = await ethers.getContractFactory("MockUSDC");
    usdc = await USDC.deploy();
    await usdc.waitForDeployment();

    // Deploy BridgeHTLC
    const HTLC = await ethers.getContractFactory("BridgeHTLC");
    htlc = await HTLC.deploy();
    await htlc.waitForDeployment();

    // Approve HTLC to spend initiator's mUSDC
    await usdc.connect(initiator).approve(await htlc.getAddress(), ethers.MaxUint256);
  });

  async function lockSwap(overrides = {}) {
    const timelock = (await time.latest()) + 3600; // 1 hour from now
    const tx = await htlc.connect(initiator).lock(
      overrides.hashlock ?? HASHLOCK,
      overrides.recipient ?? recipient.address,
      overrides.timelock ?? timelock,
      await usdc.getAddress(),
      overrides.amount ?? AMOUNT
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(l => l.fragment?.name === "Locked");
    return { swapId: event.args.swapId, timelock };
  }

  // ─── lock ─────────────────────────────────────────────────────────────────

  it("locks tokens and emits Locked", async () => {
    const before = await usdc.balanceOf(await htlc.getAddress());
    const { swapId } = await lockSwap();
    const after = await usdc.balanceOf(await htlc.getAddress());

    expect(after - before).to.equal(AMOUNT);

    const swap = await htlc.swaps(swapId);
    expect(swap.amount).to.equal(AMOUNT);
    expect(swap.hashlock).to.equal(HASHLOCK);
    expect(swap.withdrawn).to.equal(false);
  });

  it("reverts on duplicate swapId", async () => {
    const fixedTimelock = (await time.latest()) + 3600;
    await lockSwap({ timelock: fixedTimelock });
    await expect(lockSwap({ timelock: fixedTimelock })).to.be.revertedWithCustomError(htlc, "SwapAlreadyExists");
  });

  it("reverts on zero amount", async () => {
    const timelock = (await time.latest()) + 3600;
    await expect(
      htlc.connect(initiator).lock(HASHLOCK, recipient.address, timelock, await usdc.getAddress(), 0)
    ).to.be.revertedWithCustomError(htlc, "ZeroAmount");
  });

  // ─── redeem ───────────────────────────────────────────────────────────────

  it("redeems with correct secret", async () => {
    const { swapId } = await lockSwap();
    const before = await usdc.balanceOf(recipient.address);

    await htlc.connect(recipient).redeem(swapId, SECRET);

    const after = await usdc.balanceOf(recipient.address);
    expect(after - before).to.equal(AMOUNT);

    const swap = await htlc.swaps(swapId);
    expect(swap.withdrawn).to.equal(true);
    expect(swap.secret).to.equal(SECRET);
  });

  it("stores secret on-chain (observable by BCH responder)", async () => {
    const { swapId } = await lockSwap();
    await htlc.connect(recipient).redeem(swapId, SECRET);
    const stored = await htlc.getSecret(swapId);
    expect(stored).to.equal(SECRET);
  });

  it("reverts redeem with wrong secret", async () => {
    const { swapId } = await lockSwap();
    const badSecret = ethers.encodeBytes32String("wrong-secret");
    await expect(htlc.connect(recipient).redeem(swapId, badSecret))
      .to.be.revertedWithCustomError(htlc, "HashlockMismatch");
  });

  it("reverts double-redeem", async () => {
    const { swapId } = await lockSwap();
    await htlc.connect(recipient).redeem(swapId, SECRET);
    await expect(htlc.connect(recipient).redeem(swapId, SECRET))
      .to.be.revertedWithCustomError(htlc, "AlreadyWithdrawn");
  });

  // ─── refund ───────────────────────────────────────────────────────────────

  it("refunds after timelock expires", async () => {
    const { swapId, timelock } = await lockSwap();
    const before = await usdc.balanceOf(initiator.address);

    await time.increaseTo(timelock + 1);
    await htlc.connect(initiator).refund(swapId);

    const after = await usdc.balanceOf(initiator.address);
    expect(after - before).to.equal(AMOUNT);
  });

  it("reverts refund before timelock", async () => {
    const { swapId } = await lockSwap();
    await expect(htlc.connect(initiator).refund(swapId))
      .to.be.revertedWithCustomError(htlc, "TimelockNotExpired");
  });

  it("reverts refund after redeem", async () => {
    const { swapId, timelock } = await lockSwap();
    await htlc.connect(recipient).redeem(swapId, SECRET);
    await time.increaseTo(timelock + 1);
    await expect(htlc.connect(initiator).refund(swapId))
      .to.be.revertedWithCustomError(htlc, "AlreadyWithdrawn");
  });

  // ─── MockUSDC faucet ──────────────────────────────────────────────────────

  it("MockUSDC faucet mints tokens", async () => {
    const before = await usdc.balanceOf(other.address);
    await usdc.faucet(other.address, ethers.parseUnits("1000", 6));
    const after = await usdc.balanceOf(other.address);
    expect(after - before).to.equal(ethers.parseUnits("1000", 6));
  });

  it("MockUSDC faucet rejects > 10k", async () => {
    await expect(
      usdc.faucet(other.address, ethers.parseUnits("10001", 6))
    ).to.be.revertedWith("Max 10k per faucet call");
  });
});
