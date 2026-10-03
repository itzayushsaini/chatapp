import { http } from './http.js'

// Web Push - notifications while PingMe is closed. See utils/push.js.

// The server's public VAPID key, or null if push is not set up there.
export const getPushKey = () => http.get('/push/key').then((r) => r.data.publicKey)

// `subscription` is the browser's PushSubscription as JSON: { endpoint, keys }.
export const savePushSubscription = ({ endpoint, keys }) => http.post('/push/subscriptions', { endpoint, keys })

export const deletePushSubscription = (endpoint) => http.delete('/push/subscriptions', { data: { endpoint } })
