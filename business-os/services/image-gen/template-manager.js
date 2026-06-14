'use strict';
// Template Manager — stub for image-gen server

const templates = [];

function listTemplates(category) { return templates.filter(t => !category || t.category === category); }
function getTemplate(id) { return templates.find(t => t.id === id) || null; }
function createTemplate(data) {
  const tpl = { id: `tpl_${templates.length + 1}`, ...data, createdAt: new Date().toISOString() };
  templates.push(tpl);
  return tpl;
}
function deleteTemplate(id) {
  const idx = templates.findIndex(t => t.id === id);
  if (idx === -1) return false;
  templates.splice(idx, 1);
  return true;
}
async function renderTemplate(templateId, data, options) {
  throw new Error('template render not implemented');
}
async function batchRender(renders) {
  throw new Error('template batch render not implemented');
}

module.exports = {
  listTemplates,
  getTemplate,
  createTemplate,
  deleteTemplate,
  renderTemplate,
  batchRender,
};
