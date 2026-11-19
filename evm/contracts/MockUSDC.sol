// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockUSDC
 * @notice Minimal ERC-20 test token mimicking USDC for local/testnet use.
 *         TESTNET ONLY — no real value. Freely mintable by anyone.
 *
 * Used when Circle's testnet USDC faucet is unavailable without KYC.
 */
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    uint8 private constant _DECIMALS = 6; // USDC uses 6 decimals

    constructor() ERC20("Mock USDC (Testnet)", "mUSDC") {
        // Mint 1,000,000 mUSDC to deployer for testing
        _mint(msg.sender, 1_000_000 * 10 ** _DECIMALS);
    }

    /// @notice Anyone can mint more for testing purposes
    function faucet(address to, uint256 amount) external {
        require(amount <= 10_000 * 10 ** _DECIMALS, "Max 10k per faucet call");
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }
}
