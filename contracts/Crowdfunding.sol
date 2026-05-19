// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Crowdfunding {
    address public immutable owner;
    uint256 public immutable goal;
    uint256 public immutable deadline;
    uint256 public totalRaised;
    mapping(address => uint256) public contributions;

    bool public withdrawn;

    event Contributed(address indexed contributor, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event Refunded(address indexed contributor, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier beforeDeadline() {
        require(block.timestamp < deadline, "Campaign deadline has passed");
        _;
    }

    modifier afterDeadline() {
        require(block.timestamp >= deadline, "Campaign is still active");
        _;
    }

    constructor(uint256 _goal, uint256 _durationInDays) {
        require(_goal > 0, "Goal must be greater than 0");
        require(_durationInDays > 0, "Duration must be greater than 0");

        owner = msg.sender;
        goal = _goal;
        deadline = block.timestamp + (_durationInDays * 1 days);
    }

    function contribute() external payable beforeDeadline {
        require(msg.value > 0, "Contribution must be greater than 0");

        // Effects
        contributions[msg.sender] += msg.value;
        totalRaised += msg.value;

        emit Contributed(msg.sender, msg.value);
    }

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
