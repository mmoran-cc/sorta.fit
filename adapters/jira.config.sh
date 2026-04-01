#!/usr/bin/env bash
# Jira adapter configuration — status and transition IDs for DEV project
# Discovered from inkrp.atlassian.net

# Status IDs (used to query cards in each lane)
STATUS_TODO=10000
STATUS_REFINED=10070
STATUS_AGENT=10069
STATUS_IN_PROGRESS=10001
STATUS_QA=10036
STATUS_DONE=10002
STATUS_BACKLOG=10003

# Transition IDs (used to move cards between lanes)
TRANSITION_TODO=11
TRANSITION_REFINED=5
TRANSITION_AGENT=4
TRANSITION_IN_PROGRESS=21
TRANSITION_QA=3
TRANSITION_BACKLOG=2
TRANSITION_DONE=31
