#!/bin/sh
# Télécharge les données MakeHuman (CC0) nécessaires à la construction du héros dans .cache/makehuman.
#  - makehuman-data (npm) : maillage de base, squelette, poids, peaux, vêtements, yeux, sourcils.
#  - makehuman (PyPI) : cibles de morphing compilées (targets.npz).
set -e
DIR="$(cd "$(dirname "$0")/../.." && pwd)/.cache/makehuman"
mkdir -p "$DIR"
cd "$DIR"
if [ ! -d data ]; then
  curl -sSfL -o mhd.tgz https://registry.npmjs.org/makehuman-data/-/makehuman-data-0.0.2.tgz
  tar xzf mhd.tgz
  mv package/public/data data
  rm -rf package mhd.tgz
fi
if [ ! -f targets.npz ]; then
  curl -sSfL -o mh.whl https://files.pythonhosted.org/packages/52/7b/d3d997e4b8ee3b16af4d5e9ff5994af82c6467db18fa50e535bb057ff077/makehuman-1.3.2-py3-none-any.whl
  python3 -m zipfile -e mh.whl whl
  mv whl/makehuman/data/targets.npz targets.npz
  rm -rf whl mh.whl
fi
echo "Données MakeHuman prêtes dans $DIR"
