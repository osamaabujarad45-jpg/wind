"""Reconcile the two class counts: definitions vs top-level types.

A decompiler queues one unit per top-level type; inner/anonymous types are emitted
inside their outer class. This measures how the two numbers relate.

Usage: python count-class-basis.py <classes_txt>
"""
import sys
from collections import Counter

names = [l.strip() for l in open(sys.argv[1], encoding="utf-8") if l.strip()]
inner = [n for n in names if "$" in n]
top = [n for n in names if "$" not in n]
depth = Counter(n.count("$") for n in names)

print(f"definitions: {len(names)}")
print(f"inner (name contains $): {len(inner)}")
print(f"top-level (no $): {len(top)}")
print("nesting depth histogram:", dict(sorted(depth.items())))
print("first five inner examples:", inner[:5])
