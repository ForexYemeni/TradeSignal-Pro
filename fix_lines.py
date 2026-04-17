#!/usr/bin/env python3
"""Fix TradingView Pine Script long lines - very aggressive multi-pass wrapping."""

import re

MAX_LEN = 100

def get_indent(line):
    m = re.match(r'^(\s*)', line)
    return m.group(1) if m else ''

def indent_spaces(indent):
    return len(indent.replace('\t', '    '))

def count_not_in_string(content, char, up_to):
    """Count occurrences of char in content[0:up_to] not inside strings."""
    count = 0
    in_str = False
    sc = None
    i = 0
    while i < up_to:
        c = content[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == sc:
                in_str = False
        else:
            if c in ('"', "'"):
                in_str = True
                sc = c
            elif c == char:
                count += 1
        i += 1
    return count

def find_break(content, max_len):
    """Find the best break position in content string."""
    n = len(content)
    if n <= max_len:
        return -1
    
    # Parse to find break points with their types
    in_str = False
    sc = None
    paren_depth = 0
    candidates = []
    
    i = 0
    while i < n:
        c = content[i]
        if in_str:
            if c == '\\':
                i += 2
                continue
            if c == sc:
                in_str = False
        else:
            if c in ('"', "'"):
                in_str = True
                sc = c
            elif c == '(':
                paren_depth += 1
            elif c == ')':
                paren_depth -= 1
            elif c == ',' and paren_depth >= 1:
                # Break after comma+space
                candidates.append((i+2, 3, 'comma'))  # pos, priority, type
            elif i + 1 < n and content[i:i+4] == ' or ' and paren_depth >= 0:
                candidates.append((i+4, 2, 'or'))
            elif i + 1 < n and content[i:i+5] == ' and ' and paren_depth >= 0:
                candidates.append((i+5, 2, 'and'))
            elif c == '+' and i + 1 < n and content[i+1] == ' ' and paren_depth >= 0:
                candidates.append((i+2, 1, 'plus'))
        i += 1
    
    # Find best candidate: closest to max_len but not less than 15
    # Prefer commas inside parens, then or/and, then plus
    best = -1
    best_priority = -1
    best_dist = 999
    
    for pos, pri, typ in candidates:
        if pos < 15 or pos > max_len + 20:
            continue
        dist = abs(pos - max_len)
        # Prefer closer to max_len, but also prefer higher priority
        if pos <= max_len:
            # Inside the limit - good
            if pri > best_priority or (pri == best_priority and dist < best_dist):
                best = pos
                best_priority = pri
                best_dist = dist
        elif pos <= max_len + 20:
            # Slightly over - only if no good in-limit option found yet
            if best < 15:  # No good option found yet
                if pri > best_priority or (pri == best_priority and pos < best or best < 15):
                    best = pos
                    best_priority = pri
                    best_dist = dist
    
    if best < 15:
        # Desperate: find any space between 15 and max_len
        for i in range(min(n-1, max_len), 14, -1):
            if content[i] == ' ':
                return i + 1
        return -1
    
    return best

def wrap_line(line, max_len=MAX_LEN, depth=0):
    if depth > 20:
        return [line]
    
    indent = get_indent(line)
    stripped = line.strip()
    
    if len(stripped) <= max_len or not stripped:
        return [line]
    
    break_pos = find_break(stripped, max_len)
    
    if break_pos < 0:
        return [line]
    
    first_part = stripped[:break_pos].rstrip()
    second_part = stripped[break_pos:].lstrip()
    
    if not second_part:
        return [indent + first_part]
    
    base_is = indent_spaces(indent)
    new_indent = ' ' * (base_is + 4)
    
    rest = wrap_line(new_indent + second_part, max_len, depth + 1)
    
    return [indent + first_part] + rest

def fix_pine_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    result = []
    for line in lines:
        line = line.rstrip('\n')
        wrapped = wrap_line(line)
        result.extend(wrapped)
    
    return '\n'.join(result) + '\n'

if __name__ == '__main__':
    inp = '/home/z/my-project/download/FOREXYEMENI-PRO-v2.0.pine'
    out = '/home/z/my-project/download/FOREXYEMENI-PRO-v2.0-fixed.pine'
    
    fixed = fix_pine_file(inp)
    
    with open(out, 'w', encoding='utf-8') as f:
        f.write(fixed)
    
    lines = fixed.split('\n')
    long_lines = [(i+1, len(l)) for i, l in enumerate(lines) if len(l) > MAX_LEN]
    
    print(f"Total lines: {len(lines)}")
    print(f"Lines still over {MAX_LEN}: {len(long_lines)}")
    for ln, length in long_lines[:50]:
        preview = lines[ln-1][:90]
        print(f"  L{ln} ({length}): {preview}")
