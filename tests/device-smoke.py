"""UI regression against the installed sample/permission-free consumer; never installs or signs.
Use --snapshot for assertions against a previously captured real scope layout.
"""
import argparse,json,pathlib,re,subprocess,time
p=argparse.ArgumentParser();p.add_argument('--snapshot');p.add_argument('--hdc');p.add_argument('--target');p.add_argument('--bundle',default='com.petterp.floatingx.consumer');p.add_argument('--output',default='work/device-smoke');a=p.parse_args()
def flatten(n):
 yield n['attributes']
 for c in n.get('children',[]):yield from flatten(c)
def find(ns,text,type=None):
 return next(n for n in ns if n.get('text')==text and (type is None or n.get('type')==type))
def initial(ns):
 assert find(ns,'拖动标题 / 点击 / 长按'), 'missing rendered builder title'
 assert find(ns,'浮窗内按钮'), 'missing mounted builder button'
 assert find(ns,'API 12 局部浮窗'), 'host Builder lost its owning page'
if a.snapshot:
 initial(list(flatten(json.loads(pathlib.Path(a.snapshot).read_text()))));print('snapshot regression PASS');raise SystemExit
assert a.hdc and a.target, '--hdc and --target are required'
assert a.bundle in ['com.petterp.floatingx.consumer','com.petterp.floatingx.sample'], 'scope limited to our test bundles'
out=pathlib.Path(a.output);out.mkdir(parents=True,exist_ok=True);history=[]
def cmd(args):
 full=[a.hdc,'-t',a.target]+args;r=subprocess.run(full,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=30)
 history.append({'command':full,'exit_code':r.returncode,'output':r.stdout});(out/'commands.json').write_text(json.dumps(history,indent=2));assert r.returncode==0,r.stdout;return r.stdout

def dump(name):
 remote='/data/local/tmp/floatingx-smoke-'+name+'.json';f=out/(name+'.json')
 cmd(['shell','uitest dumpLayout -p '+remote+' -b '+a.bundle]);cmd(['file','recv',remote,str(f)])
 return json.loads(f.read_text())
def ns(j):return list(flatten(j))
def rect(n,key='bounds'):return list(map(int,re.findall(r'-?\d+',n[key])))
def dims(n):
 x,y,u,v=rect(n,'origBounds');return u-x,v-y

def click(j,text,type=None):
 x,y,u,v=rect(find(ns(j),text,type));cmd(['shell',f'uitest uiInput click {(x+u)//2} {(y+v)//2}']);time.sleep(.35)

def poll(name,predicate):
 deadline=time.monotonic()+5
 while True:
  j=dump(name)
  if predicate(ns(j)):return j
  assert time.monotonic()<deadline,'condition did not settle: '+name
  time.sleep(.15)
def has(text):return lambda entries:any(n.get('text')==text for n in entries)
def absent(text):return lambda entries:not any(n.get('text')==text for n in entries)
def column(j):
 candidates=[]
 def walk(n):
  if n['attributes'].get('type')=='Column' and any(x.get('text') in ['浮窗内按钮','拖动标题 / 点击 / 长按','同节点更新内容'] for x in flatten(n)):candidates.append(n)
  for c in n.get('children',[]):walk(c)
 walk(j);return candidates[-1]
def viewport(j):
 candidates=[]
 def walk(n):
  if n['attributes'].get('type')=='Stack' and n['attributes'].get('clip')=='true' and any(x.get('text') in ['浮窗内按钮','拖动标题 / 点击 / 长按','同节点更新内容'] for x in flatten(n)):candidates.append(n['attributes'])
  for c in n.get('children',[]):walk(c)
 walk(j);return candidates[-1]
def swipe_title(j,to_x,to_y,label='拖动标题 / 点击 / 长按'):
 x,y,u,v=rect(find(ns(j),label));cmd(['shell',f'uitest uiInput swipe {(x+u)//2} {(y+v)//2} {to_x} {to_y} 1200']);time.sleep(.4)

cmd(['shell','aa force-stop '+a.bundle]);cmd(['shell','aa start -b '+a.bundle+' -a EntryAbility'])
j=poll('initial',has('浮窗内按钮'));initial(ns(j));full=dims(column(j)['attributes']);print('initial render PASS',full,flush=True)
click(j,'隐','Button');j=poll('hidden',absent('浮窗内按钮'))
click(j,'显','Button');j=poll('shown',has('浮窗内按钮'));print('hide/show PASS',flush=True)
click(j,'浮窗外按钮','Button');j=poll('outer-button',has('外按钮点击'))
click(j,'浮窗内按钮','Button');j=poll('inner-button',has('内按钮点击'));print('outer/inner native buttons PASS',flush=True)
x,y,u,v=rect(find(ns(j),'拖动标题 / 点击 / 长按'));before=rect(viewport(j));swipe_title(j,(x+u)//2+150,(y+v)//2+150)
j=poll('drag',has('内按钮点击'));assert rect(viewport(j))!=before,'swipe did not move float';print('drag without click PASS',flush=True)
click(j,'移动','Button');j=dump('program-move');assert rect(viewport(j))!=before;print('program move PASS',flush=True)
click(j,'DisplayOnly','Button');j=dump('display-only')
r1=rect(find(ns(j),'浮窗内按钮'));r2=rect(find(ns(j),'浮窗外按钮'));left,top,right,bottom=max(r1[0],r2[0]),max(r1[1],r2[1]),min(r1[2],r2[2]),min(r1[3],r2[3]);assert left<right and top<bottom,'no overlap for hit-region proof'
cmd(['shell',f'uitest uiInput click {(left+right)//2} {(top+bottom)//2}']);j=poll('display-only-hit',has('外按钮点击'));print('DisplayOnly overlap hit passes through PASS',flush=True)
click(j,'ClickOnly','Button');j=dump('click-only-before');before=rect(viewport(j));x,y,u,v=rect(find(ns(j),'拖动标题 / 点击 / 长按'));swipe_title(j,(x+u)//2+100,(y+v)//2-100);j=dump('click-only-after');assert rect(viewport(j))==before;print('ClickOnly does not drag PASS',flush=True)
click(j,'浮窗内按钮','Button');j=poll('click-only-inner-restored',has('内按钮点击'));print('ClickOnly child button restored PASS',flush=True)
click(j,'Normal','Button');j=dump('normal');click(j,'更新内容','Button');j=poll('content-updated',has('同节点更新内容'));assert dims(column(j)['attributes'])==full;print('same-node content update PASS',flush=True)
click(j,'浮窗内按钮','Button');j=poll('normal-inner-restored',has('更新后点击'));print('Normal child button restored PASS',flush=True)
root=next(n for n in ns(j) if n.get('type')=='root');screen=rect(root)
for direction in ['left','right','top','bottom']:
 click(j,'移动','Button');j=dump('move-'+direction)
 click(j,direction,'Button');j=dump('direction-'+direction)
 click(j,'半隐藏','Button');j=dump('enable-half-'+direction)
 host=next(n for n in ns(j) if n.get('type')=='Stack' and n.get('clip')=='true' and dims(n)[0]>full[0]);hx,hy,hu,hv=rect(host)
 to={'left':(hx+1,hy+100),'right':(hu-2,hy+100),'top':((hx+hu)//2,hy+1),'bottom':((hx+hu)//2,hv-2)}[direction]
 swipe_title(j,*to,label='同节点更新内容');j=dump('half-'+direction)
 assert dims(column(j)['attributes'])==full,'full content shrank: '+direction
 visible=dims(viewport(j));expected=(full[0]/2,full[1]) if direction in ['left','right'] else (full[0],full[1]/2)
 assert all(abs(x-y)<=1 for x,y in zip(visible,expected)),(direction,visible,expected)
 time.sleep(.35);j=dump('stable-half-'+direction);assert dims(column(j)['attributes'])==full
 click(j,'半隐藏','Button');j=poll('expanded-'+direction,has('同节点更新内容'));assert dims(viewport(j))==full
 print('half/expand '+direction+' PASS',flush=True)
click(j,'卸载/重挂','Button');j=poll('unmounted',absent('浮窗内按钮'));click(j,'卸载/重挂','Button');j=poll('remounted',has('浮窗内按钮'));print('scope remount retained intent PASS',flush=True)
click(j,'取消','Button');j=poll('scope-canceled',absent('浮窗内按钮'));click(j,'显','Button');j=dump('terminal-show');assert absent('浮窗内按钮')(ns(j));print('scope terminal cancel PASS',flush=True)
click(j,'应用','Text');j=poll('app-initial',has('应用浮窗：拖动标题'));print('app actual rendering PASS',flush=True)
click(j,'底层按钮','Button');j=poll('app-outer',has('底层按钮已点击'));click(j,'内按钮','Button');j=poll('app-inner',has('内按钮已点击'));print('app inner/blank overlay buttons PASS',flush=True)
click(j,'隐藏','Button');j=poll('app-hidden',absent('应用浮窗：拖动标题'));click(j,'显示','Button');j=poll('app-shown',has('应用浮窗：拖动标题'))
click(j,'router 黑名单页面','Button');j=poll('router-blocked',has('router 黑名单页面：浮窗暂隐'));assert absent('应用浮窗：拖动标题')(ns(j));click(j,'返回允许页面','Button');j=poll('router-return',has('应用浮窗：拖动标题'));print('router blacklist/return PASS',flush=True)
click(j,'Navigation 黑名单','Button');j=poll('navigation-blocked',has('黑名单 destination：暂时隐藏'));assert absent('应用浮窗：拖动标题')(ns(j));click(j,'返回','Button');j=poll('navigation-return',has('应用浮窗：拖动标题'));print('Navigation blacklist/return PASS',flush=True)
cmd(['shell','uitest uiInput keyEvent Home']);cmd(['shell','aa start -b '+a.bundle+' -a EntryAbility']);j=poll('foreground-return',has('应用浮窗：拖动标题'));print('app foreground return PASS',flush=True)
click(j,'隐藏','Button');j=poll('explicit-hide-before-background',absent('应用浮窗：拖动标题'));cmd(['shell','uitest uiInput keyEvent Home']);cmd(['shell','aa start -b '+a.bundle+' -a EntryAbility']);j=poll('explicit-hide-return',has('底层按钮'));assert absent('应用浮窗：拖动标题')(ns(j));print('user hide retained after background/return PASS',flush=True)
print('DEVICE SMOKE PASS; rotation, keyboard, two-finger and system authorization need separate acceptance.',flush=True)
