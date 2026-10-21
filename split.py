import re,sys
src=open('simulate.ts').read().split('\n')
hdr_end=next(i for i,l in enumerate(src) if l.startswith('type DayOfYear'))
header=src[:hdr_end]
body=src[hdr_end:]
decl=re.compile(r'^(export\s+)?(async\s+)?(function\*?|const|let|interface|type|class)\s+(\w+)')
starts=[]
for i,l in enumerate(body):
    m=decl.match(l)
    if m:
        j=i
        while j>0 and re.match(r'^(//|/\*\*| \*)',body[j-1]): j-=1
        starts.append((j,m.group(4)))
# dedupe: a start must be after previous
chunks=[]
for k,(s,n) in enumerate(starts):
    e=starts[k+1][0] if k+1<len(starts) else len(body)
    chunks.append((n,'\n'.join(body[s:e]).rstrip('\n')+'\n'))
assign={}
def A(f,names):
    for n in names.split(): assign[n]=f
A('plan','FieldTaskEntry DayTask DayOfYear LAST_JOIN_MONTH DAYS_PER_BONUS_YEAR SATIATION_EPSILON EPSILON SOWING_EPSILON_KG isOn planYear joinFinishedParts fieldSowingTargets trimPlan SOW_AFTER_DIG_DAYS sowingCapacity cropsKey wantedPloughPairsOf orchardHarvestLoad forestBonusUntil villageProductivity occupiedDwellings householdCount')
A('work','fieldTasks springHarvestAhead THRESH_RANK work asideWork orchardTask')
A('build','decayEmptyDwellings constructionNeed FoundingIndex foundingIndex foundingParts build woodworkToday invest foundPart isFinished finishConstructions finishCemetery finishedEvent decideRebuilds')
A('hauls','roadShare planTaskHauls LogHaul logHaulCandidates logHaulPlan haulLogs CharcoalCartJob OreCartJob CartJobsDay NO_CART_JOBS planCartJobs SmithCartsDay paySmithCarts smithFetchPlans CarriedToday carried taskCarryDemand reachableFelling logsDemand oreDemand jobsDemand planSeedHauls')
A('food','harvestWinter harvest endThreshing eat')
A('main','advanceVillage advanceVillageSteps trimChronicle simulateDay')
files={}
for n,t in chunks:
    f=assign.get(n)
    if not f: print('UNASSIGNED',n); sys.exit(1)
    files.setdefault(f,[]).append((n,t))
heads={'plan':'Pomocné kroky simulace dne – roční plán osevu, jeho zkrácení, kapacita setí a společné pomocné funkce.',
'work':'Práce dne – polní úlohy v pořadí a `work()` s rozdělením práce vsi.',
'build':'Stavby a jejich dokončování – investice práce, zakládání dílů, dokončení staveb, přestavby obydlí.',
'hauls':'Svoz a jízdy vozů – svoz úrody, sena a klád, úlohy vozů (uhlí, ruda, hlína, voda, osivo).',
'food':'Sklizeň, výmlat a jídlo dne.'}
hdr_text='\n'.join(header)
# parse imports
imps=[]  # (text, names, isType)
txt=hdr_text
for m in re.finditer(r"import (type )?(\{[^}]*\}|\w+) from '([^']+)';",txt,re.S):
    imps.append(m)
def names_of(m):
    inner=m.group(2)
    if not inner.startswith('{'): return [(inner,inner,False)]
    out=[]
    for part in inner[1:-1].split(','):
        p=part.strip()
        if not p: continue
        t=p.startswith('type ')
        if t: p=p[5:].strip()
        a=p.split(' as ')
        out.append((a[0].strip(),a[-1].strip(),t))
    return out
decls={}
for f,l in files.items():
    for n,_ in l: decls[n]=f
def build_file(f,items):
    body='\n'.join(t for _,t in items)
    # export all decls
    def exp(t):
        return re.sub(r'(?m)^(?!export )(async\s+)?(function\*?|const|let|interface|type|class)\s+(\w+)',lambda m:'export '+m.group(0) if f!='main' else m.group(0),t)
    if f!='main': body=exp(body)
    else:
        pass
    used=lambda nm: re.search(r"(?<![\w])(?<![\w)\]]\.)(?<!\?\.)"+re.escape(nm)+r"\b",body) is not None
    lines=[]
    for m in imps:
        ns=[(o,l,t) for o,l,t in names_of(m) if used(l)]
        if not ns: continue
        whole_type=bool(m.group(1))
        if not m.group(2).startswith('{'):
            lines.append(f"import {'type ' if whole_type else ''}{m.group(2)} from '{m.group(3)}';"); continue
        parts=[('type ' if (t and not whole_type) else '')+(o if o==l else f'{o} as {l}') for o,l,t in ns]
        lines.append(f"import {'type ' if whole_type else ''}{{ {', '.join(parts)} }} from '{m.group(3)}';")
    # cross imports
    cross={}
    for n,g in decls.items():
        if g!=f and used(n):
            cross.setdefault(g,[]).append(n)
    for g,ns in sorted(cross.items()):
        lines.append(f"import {{ {', '.join(sorted(ns))} }} from './simulate-{g}';")
    return lines,body
for f,items in files.items():
    lines,body=build_file(f,items)
    if f=='main':
        out='\n'.join(lines)+'\n\n'+body
        fn='simulate.ts'
        out=out.rstrip('\n')+'\n'
        # re-export? none
    else:
        out='// '+heads[f]+'\n'+'\n'.join(lines)+'\n\n'+body
        fn=f'simulate-{f}.ts'
    open(fn,'w').write(out)
    print(fn,len(out.split('\n')))
