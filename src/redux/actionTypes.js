/* @flow */

type ActionTypes = {|
  CONNECTION_CHANGE: '@@network-connectivity/CONNECTION_CHANGE',
  FETCH_OFFLINE_MODE: '@@network-connectivity/FETCH_OFFLINE_MODE',
  REMOVE_FROM_ACTION_QUEUE: '@@network-connectivity/REMOVE_FROM_ACTION_QUEUE',
  DISMISS_ACTIONS_FROM_QUEUE: '@@network-connectivity/DISMISS_ACTIONS_FROM_QUEUE',
|};

const actionTypes: ActionTypes = {
  CONNECTION_CHANGE: '@@network-connectivity/CONNECTION_CHANGE',
  FETCH_OFFLINE_MODE: '@@network-connectivity/FETCH_OFFLINE_MODE',
  INCREMENT_RETRYABLE_THUNK_ATTEMPT: '@@network-connectivity/INCREMENT_RETRYABLE_THUNK_ATTEMPT',
  REMOVE_FROM_ACTION_QUEUE: '@@network-connectivity/REMOVE_FROM_ACTION_QUEUE',
  REMOVE_HEAD_FROM_ACTION_QUEUE: '@@network-connectivity/REMOVE_HEAD_FROM_ACTION_QUEUE',
  DISMISS_ACTIONS_FROM_QUEUE:
    '@@network-connectivity/DISMISS_ACTIONS_FROM_QUEUE',
};

export default actionTypes;
