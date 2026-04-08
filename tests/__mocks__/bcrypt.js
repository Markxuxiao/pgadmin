// Mock bcrypt for testing
export async function hash(data, saltOrRounds) {
  return Promise.resolve('$2a$10$mock_hash');
}

export async function compare(data, encrypted) {
  return Promise.resolve(true);
}

export function getRounds(hash) {
  return 10;
}

export default { hash, compare, getRounds };
