// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Crowdfunding
/// @author FundChain Team
/// @notice Manages a time-limited crowdfunding campaign with contributions, owner withdrawal and contributor refunds.
/// @dev The contract uses deadline checks, owner access control and the Checks-Effects-Interactions pattern for ETH transfers.
contract Crowdfunding {
    /// @notice Address of the campaign owner.
    /// @dev The owner is set once at deployment and cannot be changed.
    address public immutable owner;

    /// @notice Funding goal of the campaign, expressed in wei.
    uint256 public immutable goal;

    /// @notice Timestamp after which contributions are no longer accepted.
    uint256 public immutable deadline;

    /// @notice Total amount raised by the campaign, expressed in wei.
    uint256 public totalRaised;

    /// @notice Amount contributed by each address.
    mapping(address => uint256) public contributions;

    /// @notice Indicates whether the campaign owner has already withdrawn the collected funds.
    bool public withdrawn;

    /// @notice Emitted when a user contributes ETH to the campaign.
    /// @param contributor Address of the contributor.
    /// @param amount Amount contributed in wei.
    event Contributed(address indexed contributor, uint256 amount);

    /// @notice Emitted when the owner withdraws the campaign funds.
    /// @param recipient Address receiving the withdrawn funds.
    /// @param amount Amount withdrawn in wei.
    event Withdrawn(address indexed recipient, uint256 amount);

    /// @notice Emitted when a contributor receives a refund.
    /// @param contributor Address receiving the refund.
    /// @param amount Amount refunded in wei.
    event Refunded(address indexed contributor, uint256 amount);

    /// @notice Restricts a function to the campaign owner.
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    /// @notice Allows execution only before the campaign deadline.
    modifier beforeDeadline() {
        require(block.timestamp < deadline, "Campaign deadline has passed");
        _;
    }

    /// @notice Allows execution only after or at the campaign deadline.
    modifier afterDeadline() {
        require(block.timestamp >= deadline, "Campaign is still active");
        _;
    }

    /// @notice Creates a crowdfunding campaign.
    /// @param _goal Funding goal of the campaign in wei.
    /// @param _durationInDays Duration of the campaign in days.
    constructor(uint256 _goal, uint256 _durationInDays) {
        require(_goal > 0, "Goal must be greater than 0");
        require(_durationInDays > 0, "Duration must be greater than 0");

        owner = msg.sender;
        goal = _goal;
        deadline = block.timestamp + (_durationInDays * 1 days);
    }

    /// @notice Contributes ETH to the campaign before the deadline.
    /// @dev The sent value is added to the sender's contribution and to the campaign total.
    function contribute() external payable beforeDeadline {
        require(msg.value > 0, "Contribution must be greater than 0");

        // Effects
        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;

        emit Contributed(msg.sender, msg.value);
    }

    /// @notice Withdraws the collected funds to the owner after a successful campaign.
    /// @dev Can only be called by the owner after the deadline if the funding goal has been reached.
    function withdraw() external onlyOwner afterDeadline {
        require(!withdrawn, "Funds already withdrawn");
        require(totalRaised >= goal, "Funding goal not reached");

        uint256 amount = address(this).balance;
        require(amount > 0, "No funds available to withdraw");

        // Effects
        withdrawn = true;

        // Interaction
        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Withdraw transfer failed");

        emit Withdrawn(owner, amount);
    }

    /// @notice Refunds the caller if the campaign ended without reaching its goal.
    /// @dev The caller's contribution is reset before the ETH transfer.
    function refund() external afterDeadline {
        require(totalRaised < goal, "Funding goal was reached");

        uint256 amount = contributions[msg.sender];
        require(amount > 0, "No contribution to refund");

        // Effects
        contributions[msg.sender] = 0;
        totalRaised -= amount;

        // Interaction
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Refund transfer failed");

        emit Refunded(msg.sender, amount);
    }

    /// @notice Returns the main information about the crowdfunding campaign.
    /// @return campaignOwner Address of the campaign owner.
    /// @return campaignGoal Funding goal in wei.
    /// @return campaignDeadline Campaign deadline as a Unix timestamp.
    /// @return raised Total amount raised in wei.
    /// @return contractBalance Current ETH balance of the contract in wei.
    /// @return goalReached True if the campaign goal has been reached.
    /// @return campaignEnded True if the current timestamp is after or equal to the deadline.
    /// @return fundsWithdrawn True if the owner has already withdrawn the funds.
    function getCampaignInfo()
        external
        view
        returns (
            address campaignOwner,
            uint256 campaignGoal,
            uint256 campaignDeadline,
            uint256 raised,
            uint256 contractBalance,
            bool goalReached,
            bool campaignEnded,
            bool fundsWithdrawn
        )
    {
        campaignOwner = owner;
        campaignGoal = goal;
        campaignDeadline = deadline;
        raised = totalRaised;
        contractBalance = address(this).balance;
        goalReached = totalRaised >= goal;
        campaignEnded = block.timestamp >= deadline;
        fundsWithdrawn = withdrawn;
    }
}
