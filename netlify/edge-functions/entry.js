import { handle } from '../../worker.js';

export default async function entry(request, context) {
  return handle(request);
}
