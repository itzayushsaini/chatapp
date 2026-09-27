// The one error type we throw on purpose. Anything else reaching the error
// handler is an unexpected bug and becomes a 500.
//
//   throw new AppError(404, 'No user found')
export class AppError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'AppError'
    this.status = status
  }
}
