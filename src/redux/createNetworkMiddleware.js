/* @flow */

import { find, get } from 'lodash';
import {
  connectionChange,
  fetchOfflineMode,
  incrementRetryableThunkAttempt,
  removeHeadFromQueue,
  dismissActionsFromQueue,
} from './actionCreators';
import type { NetworkState } from '../types';
import networkActionTypes from './actionTypes';
import wait from '../utils/wait';
import crashlytics from "@react-native-firebase/crashlytics";

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

let promise = Promise.resolve();

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

function shouldWorkNextQueueItem(getState) {
  if (getState().network.isConnected !== true) {
    return false;
  }

  if (getState().network.actionQueue.length === 0) {
    return false;
  }

  return true;
}

function recordCrashlyticsError(error) {
  try {
    let errorToRecord = null;

    if (error instanceof Error) {
      errorToRecord = error;
    } else {
      errorToRecord = Error(String(error));
    }

    crashlytics().recordError(errorToRecord, "Data Sync: workNextQueueItem()");
  } catch (unexpectedError) {
    console.log("recordCrashlyticsError() unexpected error", unexpectedError);
  }
}

const workNextQueueItem = (getState, next) => {
  if (shouldWorkNextQueueItem(getState) !== true) {
    return;
  }

  promise = promise
    .then(() => {
      if (shouldWorkNextQueueItem(getState) !== true) {
        return;
      }

      next(incrementRetryableThunkAttempt());

      const queueItem = getState().network.actionQueue[0];
      const retryableThunk = next(queueItem);

      console.log("workNextQueueItem() working queue item", queueItem.meta);

      if (retryableThunk.kind !== "result") {
        console.log("workNextQueueItem() invalid retryableThunk ", retryableThunk);
        next(removeHeadFromQueue());
        workNextQueueItem(getState, next);
        return;
      }

      return retryableThunk.result
        .then(res => {
          console.log("workNextQueueItem() sync operation complete ", res);
          next(connectionChange(true));
          next(removeHeadFromQueue());
          workNextQueueItem(getState, next);
        })
        .catch(error => {
          // A network error flips the network connected flag to false. Queue items
          // will accumulate and not be worked until this flag transitions back to
          // true.
          if (error?.kind === "fetch-api-error" || error?.kind === "fetch-fatal-error") {
            console.log("workNextQueueItem() sync operation api error, will retry", error);
            next(connectionChange(false));
          } else {
            // This is an unexpected case. An error here would originate from code
            // running against the source Promise API call. For instance, if `then()`
            // code processing a successful API response threw an error.
            console.log("workNextQueueItem() sync operation unexpexcted error", error);
            recordCrashlyticsError(error);
            next(removeHeadFromQueue());
            workNextQueueItem(getState, next);
          }
        });
    })
    .catch(error => {
      // This is an unexpected case. An error here would originate from the
      // RetryableThunk before a Promise API call was created. For example,
      // code preparing the API request threw an error.
      console.log("workNextQueueItem() unexpected error", error);
      recordCrashlyticsError(error);
      next(removeHeadFromQueue());
      workNextQueueItem(getState, next);
    });
}

function createNetworkMiddleware({
  regexActionType = /FETCH.*REQUEST/,
  actionTypes = [],
  queueReleaseThrottle = 50,
}: Arguments = {}) {
  return ({ getState }: MiddlewareAPI<State>) => (
    next: (action: any) => void,
  ) => (action: any) => {
    const { isConnected, actionQueue } = getState().network;
    validateParams(regexActionType, actionTypes);

    const shouldInterceptAction = checkIfActionShouldBeIntercepted(
      action,
      regexActionType,
      actionTypes,
    );


    // Checking if we have a dismissal case
    const isAnyActionToBeDismissed = findActionToBeDismissed(
      action,
      actionQueue,
    );
    if (isAnyActionToBeDismissed && !isConnected) {
      next(dismissActionsFromQueue(action.type));
    }

    let result;

    if (shouldInterceptAction) {
      result = next(fetchOfflineMode(action));
    } else {
      result = next(action);
    }

    const authenticated = getState()?.auth?.api?.state === "AUTHENTICATED";

    if (authenticated === true && isConnected === true && getState().network.actionQueue.length > 0) {
      workNextQueueItem(getState, next);
    }

    return result;
  };
}

export default createNetworkMiddleware;
