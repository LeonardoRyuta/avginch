// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockAccessToken
 * @notice A simple ERC20 token that allows anyone to mint for testing purposes
 * @dev This token is used as an access token for the ICP Escrow Factory
 */
contract MockAccessToken is ERC20 {
    constructor() ERC20("Mock Access Token", "MAT") {
        // Mint initial supply to deployer
        _mint(msg.sender, 1000000 * 10**18);
    }

    /**
     * @notice Allows anyone to mint tokens for free (for testing only)
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Mint 1 token to caller (convenience function)
     */
    function mintToSelf() external {
        _mint(msg.sender, 1 * 10**18);
    }
}
