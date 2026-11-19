// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BridgeHTLC
 * @notice ERC-20 Hash-Time-Locked Contract for the BCH Stablecoin Bridge.
 *         TESTNET ONLY — Base Sepolia / local Hardhat node.
 *
 * Flow (initiator = EVM side, responder = BCH side):
 *
 *   1. Initiator calls lock(hashlock, recipient, timelock, token, amount)
 *      → escrows `amount` of `token` (e.g. mUSDC) in this contract.
 *   2. Responder funds the BCH BridgeHTLC on Chipnet with the same hashlock.
 *   3. Initiator calls redeem(swapId, secret) to claim test-PUSD on BCH,
 *      revealing `secret` on-chain.
 *   4. Responder sees `secret`, calls redeem(swapId, secret) here to claim mUSDC.
 *   5. If the secret is never revealed, initiator calls refund(swapId) after
 *      `timelock` seconds.
 *
 * Security model: minimal; no audit; testnet use only.
 */
contract BridgeHTLC {

    // ─── State ───────────────────────────────────────────────────────────────

    struct Swap {
        address payable initiator;
        address payable recipient;
        address token;        // ERC-20 (e.g. mUSDC)
        uint256 amount;
        bytes32 hashlock;     // sha256(secret)
        uint256 timelock;     // Unix timestamp after which refund is valid
        bool withdrawn;
        bool refunded;
        bytes32 secret;
    }

    mapping(bytes32 => Swap) public swaps;

    // ─── Events ──────────────────────────────────────────────────────────────

    event Locked(
        bytes32 indexed swapId,
        address indexed initiator,
        address indexed recipient,
        address token,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );

    event Redeemed(bytes32 indexed swapId, bytes32 secret);
    event Refunded(bytes32 indexed swapId);

    // ─── Errors ──────────────────────────────────────────────────────────────

    error SwapNotFound();
    error SwapAlreadyExists();
    error AlreadyWithdrawn();
    error AlreadyRefunded();
    error HashlockMismatch();
    error TimelockNotExpired();
    error NotInitiator();
    error TimelockTooShort();
    error ZeroAmount();

    // ─── Functions ───────────────────────────────────────────────────────────

    /**
     * @notice Lock ERC-20 tokens in a new HTLC swap.
     * @param hashlock  sha256(secret) — must match the BCH side
     * @param recipient Who can claim by revealing secret
     * @param timelock  Unix timestamp after which the initiator can refund
     * @param token     ERC-20 contract address (e.g. mUSDC)
     * @param amount    Token amount (in token's native decimals)
     * @return swapId   keccak256(hashlock, initiator, recipient, token, amount)
     */
    function lock(
        bytes32 hashlock,
        address payable recipient,
        uint256 timelock,
        address token,
        uint256 amount
    ) external returns (bytes32 swapId) {
        if (amount == 0) revert ZeroAmount();
        if (timelock <= block.timestamp + 10 minutes) revert TimelockTooShort();

        swapId = keccak256(abi.encodePacked(hashlock, msg.sender, recipient, token, amount, timelock));

        if (swaps[swapId].amount != 0) revert SwapAlreadyExists();

        // Pull tokens from caller (must have approved this contract first)
        bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(ok, "token transfer failed");

        swaps[swapId] = Swap({
            initiator: payable(msg.sender),
            recipient: recipient,
            token: token,
            amount: amount,
            hashlock: hashlock,
            timelock: timelock,
            withdrawn: false,
            refunded: false,
            secret: bytes32(0)
        });

        emit Locked(swapId, msg.sender, recipient, token, amount, hashlock, timelock);
    }

    /**
     * @notice Redeem locked tokens by revealing the preimage.
     * @param swapId  ID returned by lock()
     * @param secret  Preimage such that sha256(secret) == hashlock
     */
    function redeem(bytes32 swapId, bytes32 secret) external {
        Swap storage s = swaps[swapId];
        if (s.amount == 0) revert SwapNotFound();
        if (s.withdrawn)   revert AlreadyWithdrawn();
        if (s.refunded)    revert AlreadyRefunded();
        if (sha256(abi.encodePacked(secret)) != s.hashlock) revert HashlockMismatch();

        s.secret = secret;
        s.withdrawn = true;

        bool ok = IERC20(s.token).transfer(s.recipient, s.amount);
        require(ok, "token transfer failed");

        emit Redeemed(swapId, secret);
    }

    /**
     * @notice Refund tokens to initiator after timelock expires.
     * @param swapId  ID returned by lock()
     */
    function refund(bytes32 swapId) external {
        Swap storage s = swaps[swapId];
        if (s.amount == 0) revert SwapNotFound();
        if (s.withdrawn)   revert AlreadyWithdrawn();
        if (s.refunded)    revert AlreadyRefunded();
        if (block.timestamp < s.timelock) revert TimelockNotExpired();

        s.refunded = true;

        bool ok = IERC20(s.token).transfer(s.initiator, s.amount);
        require(ok, "token transfer failed");

        emit Refunded(swapId);
    }

    /**
     * @notice Get the secret that was used to redeem a swap.
     */
    function getSecret(bytes32 swapId) external view returns (bytes32) {
        return swaps[swapId].secret;
    }
}

// Minimal ERC-20 interface
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}
