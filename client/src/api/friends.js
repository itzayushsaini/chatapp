import { http } from './http.js'

// `params` lets axios encode the username safely instead of pasting it into
// the URL by hand.
export const searchUser = (username) =>
  http.get('/users/search', { params: { username } }).then((r) => r.data)

// Search by name or username (any part, at least 3 characters). Resolves to
// [{ user, relationship }] - up to 20 people, best matches first.
export const findUsers = (q) => http.get('/users/find', { params: { q } }).then((r) => r.data.users)

export const getFriends = () => http.get('/friends').then((r) => r.data.friends)

export const unfriend = (userId) => http.delete(`/friends/${userId}`)

export const getRequests = () => http.get('/friends/requests').then((r) => r.data)

// Resolves to { request } for a new request, or { friend } if they had
// already asked me and it was accepted straight away.
export const sendRequest = (username) =>
  http.post('/friends/requests', { username }).then((r) => r.data)

export const acceptRequest = (id) =>
  http.post(`/friends/requests/${id}/accept`).then((r) => r.data.friend)

export const declineRequest = (id) => http.post(`/friends/requests/${id}/decline`)

export const cancelRequest = (id) => http.delete(`/friends/requests/${id}`)
