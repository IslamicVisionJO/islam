"""Publish a built dist to the existing gh-pages history, without switching or resetting source."""
import pathlib,subprocess,os,tempfile,json,hashlib,sys
root=pathlib.Path(__file__).resolve().parents[1];dist=root/'dist'
def git(*args,**kwargs):return subprocess.check_output(['git','-C',str(root),*args],text=True,**kwargs).strip()
if not (dist/'index.html').is_file():raise SystemExit('Build the production site first.')
if list(dist.rglob('*.pdf')):raise SystemExit('Original PDFs must not be published.')
if len(list((dist/'videos').glob('*.mp4')))!=26:raise SystemExit('Expected 26 videos.')
source=git('rev-parse','HEAD');git('fetch','origin','gh-pages');parent=git('rev-parse','FETCH_HEAD')
old_files=git('ls-tree','--name-only',parent).splitlines()
if 'CNAME' in old_files:(dist/'CNAME').write_text(git('show',parent+':CNAME')+'\n')
(dist/'.nojekyll').write_text('')
release={'sourceCommit':source,'buildSha256':hashlib.sha256((dist/'index.html').read_bytes()).hexdigest(),'name':'التربية الإسلامية برؤية رقمية'}
(dist/'release.json').write_text(json.dumps(release,ensure_ascii=False,indent=2)+'\n')
with tempfile.TemporaryDirectory(prefix='islam-pages-',dir='/tmp') as tmp:
 env={**os.environ,'GIT_INDEX_FILE':tmp+'/index'}
 def stage(*args):return subprocess.check_output(['git','-C',str(dist),'--git-dir='+str(root/'.git'),'--work-tree='+str(dist),*args],env=env,text=True).strip()
 stage('read-tree','--empty');stage('add','-A','-f','--','.');tree=stage('write-tree')
 commit=git('commit-tree',tree,'-p',parent,input='Publish digital Islamic education platform from '+source+'\n')
 git('update-ref','refs/heads/pages-digital-release',commit)
 print('Prepared release commit:',commit,flush=True)
 if '--push' in sys.argv:
  subprocess.run(['git','-C',str(root),'push','origin',commit+':refs/heads/gh-pages'],check=True)
  print('gh-pages updated. Verify the actual Pages deployment separately.',flush=True)
 else:print('Dry preparation only; pass --push to update gh-pages.')
