import { http } from './http.js'

// null when push is not set up on the server
export const getPushKey = () => http.get('/push/key').then((r) => r.data.publicKey)

export const savePushSubscription = ({ endpoint, keys }) => http.post('/push/subscriptions', { endpoint, keys })

export const deletePushSubscription = (endpoint) => http.delete('/push/subscriptions', { data: { endpoint } })
