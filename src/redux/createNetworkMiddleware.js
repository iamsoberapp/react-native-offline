/* @flow */

import { find, get } from 'lodash';
import {
  fetchOfflineMode,
  removeActionFromQueue,
  dismissActionsFromQueue,
} from './actionCreators';
import type { NetworkState } from '../types';
import networkActionTypes from './actionTypes';
import wait from '../utils/wait';

type MiddlewareAPI<S> = {
  dispatch: (action: any) => void,
  getState(): S,
};

type State = {
  network: NetworkState,
};

type Arguments = {|
  regexActionType: RegExp,
  actionTypes: Array<string>,
  queueReleaseThrottle: number,
|};

function validateParams(regexActionType, actionTypes) {
  if ({}.toString.call(regexActionType) !== '[object RegExp]')
    throw new Error('You should pass a regex as regexActionType param');

  if ({}.toString.call(actionTypes) !== '[object Array]')
    throw new Error('You should pass an array as actionTypes param');
}

function findActionToBeDismissed(action, actionQueue) {
  return find(actionQueue, (a: *) => {
    const actionsToDismiss = get(a, 'meta.dismiss', []);
    return actionsToDismiss.includes(action.type);
  });
}

function isObjectAndShouldBeIntercepted(action, regexActionType, actionTypes) {
  return (
    typeof action === 'object' &&
    (regexActionType.test(action.type) || actionTypes.includes(action.type))
  );
}

function isThunkAndShouldBeIntercepted(action) {
  return typeof action === 'function' && action.interceptInOffline === true;
}

function checkIfActionShouldBeIntercepted(
  action,
  regexActionType,
  actionTypes,
) {
  return (
    isObjectAndShouldBeIntercepted(action, regexActionType, actionTypes) ||
    isThunkAndShouldBeIntercepted(action)
  );
}

function didComeBackOnline(action, wasConnected) {
  return (
    action.type === networkActionTypes.CONNECTION_CHANGE &&
    !wasConnected &&
    action.payload === true
  );
}

const createReleaseQueue = (getState, next) => queueItem => {
  const { isConnected } = getState().network;

  if (isConnected) {
    next(removeActionFromQueue(queueItem));
    next(queueItem);
  }
};

function createNetworkMiddleware({
  regexActionType = /FETCH.*REQUEST/,
  actionTypes = [],
  queueReleaseThrottle = 50,
}: Arguments = {}) {
  return ({ getState }: MiddlewareAPI<State>) => (
    next: (action: any) => void,
  ) => (action: any) => {
    const { isConnected, actionQueue } = getState().network;
    const releaseQueue = createReleaseQueue(
      getState,
      next
    );
    validateParams(regexActionType, actionTypes);

    const shouldInterceptAction = checkIfActionShouldBeIntercepted(
      action,
      regexActionType,
      actionTypes,
    );

    if (shouldInterceptAction && isConnected === false) {
      // Offline, preventing the original action from being dispatched.
      // Dispatching an internal action instead.
      return next(fetchOfflineMode(action));
    }

    // Checking if we have a dismissal case
    const isAnyActionToBeDismissed = findActionToBeDismissed(
      action,
      actionQueue,
    );
    if (isAnyActionToBeDismissed && !isConnected) {
      next(dismissActionsFromQueue(action.type));
    }

    if (isConnected === true && actionQueue.length > 0) {
      console.log(`Processing next item from the action queue: actionQueueSize=${actionQueue.length}`);

      // Process the next queued action FIFO-style.
      releaseQueue(getState().network.actionQueue[0]);

      // Enqueue the current, interceptable action. It will be
      // processed after all currently enqueued actions have
      // been processed.
      if (shouldInterceptAction) {
        return next(fetchOfflineMode(action));
      }
      // Process the current, non-interceptable action.
      else {
        return next(action);
      }
    }

    // Proxy the original action to the next middleware on the chain or final dispatch
    return next(action);
  };
}

export default createNetworkMiddleware;
