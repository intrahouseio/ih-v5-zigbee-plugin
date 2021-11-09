/**
 * Строится 2 уровневое дерево:
 *  - папка - устройство
 *  - лист - свойство = значение
 */

class Tree {
  constructor(id) {
    this.tree = new Node(id);
  }

  addOne(device, prop, val) {
    let updated;
    let added;

    let dnode = this.tree.getChild(device.id);
    if (!dnode) {
      dnode = new Node(device.id, device.title);
      this.tree.children.push(dnode);
      added = { parentid: '/', data: dnode };
    }

    let pnode = dnode.getChild(device.id + '_' + prop);
    if (!pnode) {
      pnode = new Node(device.id + '_' + prop, prop, dnode.id, 1, val);
      dnode.children.push(pnode);
      if (!added) {
        added = { parentid: dnode.id, data: pnode };
      }
      pnode.channel = {topic:dnode.title+' '+prop, chan:pnode.id, title: prop, parentfolder: {...device}}
    } else {
      // Узел уже есть - м б изменение значения
      pnode.title = prop + ' = ' + val;
      updated = { id: pnode.id, title: pnode.title };
    }
    return { updated, added };
  }

  getTree() {
    return this.tree;
  }
}

class Node {
  constructor(id, title, parentId, leaf, message) {
    this.id = id;

    if (leaf) {
      this.title = title + ' = ' + message;
    } else {
      this.title = title;
      this.children = [];
    }
  }

  getChild(id) {
    let node;
    if (!this.children) return;
    this.children.some(n => {
      if (n.id === id) node = n;
      return !!node;
    });
    return node;
  }
}

module.exports = Tree;
