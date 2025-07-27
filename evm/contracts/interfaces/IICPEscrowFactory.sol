// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { Address } from "../libraries/AddressLib.sol";
import { IBaseEscrow } from "./IBaseEscrow.sol";

/**
 * @title ICP Escrow Factory interface for EVM-ICP atomic swaps
 * @notice Interface for creating ICP atomic swap escrows
 * @dev Supports both EVM→ICP and ICP→EVM swap directions
 */
interface IICPEscrowFactory {

    /// @notice Thrown when insufficient ETH is sent for escrow creation
    error InsufficientEscrowBalance();

    /**
     * @notice Emitted when a source escrow is created (EVM→ICP)
     * @param escrow The address of the created source escrow
     * @param hashlock The hash of the secret
     * @param maker The address of the maker
     * @param creator The address of who created the escrow
     */
    event SrcEscrowCreated(
        address escrow, 
        bytes32 hashlock, 
        Address maker, 
        address indexed creator
    );

    /**
     * @notice Emitted when a destination escrow is created (ICP→EVM)
     * @param escrow The address of the created destination escrow
     * @param hashlock The hash of the secret
     * @param taker The address of the taker
     * @param creator The address of who created the escrow
     */
    event DstEscrowCreated(
        address escrow, 
        bytes32 hashlock, 
        Address taker, 
        address indexed creator
    );

    /**
     * @notice Creates a source escrow for EVM→ICP swaps
     * @dev Maker creates this escrow with EVM tokens, taker will provide icp
     * @param immutables The escrow immutables including icp parameters
     */
    function createSrcEscrow(IBaseEscrow.Immutables calldata immutables) external payable;

    /**
     * @notice Creates a destination escrow for ICP→EVM swaps
     * @dev Taker creates this escrow with EVM tokens, maker will provide icp  
     * @param immutables The escrow immutables including icp parameters
     */
    function createDstEscrow(IBaseEscrow.Immutables calldata immutables) external payable;

    /**
     * @notice Returns the deterministic address of a source escrow
     * @param immutables The escrow immutables
     * @return The computed address of the source escrow
     */
    function addressOfEscrowSrc(IBaseEscrow.Immutables calldata immutables) external view returns (address);

    /**
     * @notice Returns the deterministic address of a destination escrow
     * @param immutables The escrow immutables
     * @return The computed address of the destination escrow
     */
    function addressOfEscrowDst(IBaseEscrow.Immutables calldata immutables) external view returns (address);

    /**
     * @notice Returns the source escrow implementation address
     * @return The address of the source escrow implementation
     */
    function ICP_ESCROW_SRC_IMPLEMENTATION() external view returns (address);

    /**
     * @notice Returns the destination escrow implementation address
     * @return The address of the destination escrow implementation
     */
    function ICP_ESCROW_DST_IMPLEMENTATION() external view returns (address);
} 