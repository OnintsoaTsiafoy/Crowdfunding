// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Test {
    uint256 public number;

    function setNumber(uint256 _number) external {
        number = _number;
    }

    function getNumber() external view returns (uint256) {
        return number;
    }
}