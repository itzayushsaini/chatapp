import { http } from './http.js'

export const searchUser = (username) =>
  http.get('/users/search', { params: { username } }).then((r) => r.data)

export const findUsers = (q) => http.get('/users/find', { params: { q } }).then((r) => r.data.users)

export const getFriends = () => http.get('/friends').then((r) => r.data.friends)

export const unfriend = (userId) => http.delete(`/friends/${userId}`)

export const getRequests = () => http.get('/friends/requests').then((r) => r.data)

// { friend } instead of { request } when they had already asked me
export const sendRequest = (username) =>
  http.post('/friends/requests', { username }).then((r) => r.data)

export const acceptRequest = (id) =>
  http.post(`/friends/requests/${id}/accept`).then((r) => r.data.friend)

export const declineRequest = (id) => http.post(`/friends/requests/${id}/decline`)

export const cancelRequest = (id) => http.delete(`/friends/requests/${id}`)
