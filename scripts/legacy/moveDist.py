import os
import shutil

RUNTIME_DIR = "runtime"

# 统一使用固定运行目录，不再使用版本号目录命名
def moveDist():
    if not os.path.exists(RUNTIME_DIR):
        os.makedirs(RUNTIME_DIR, exist_ok=True)
    return RUNTIME_DIR

# 删除指定目录下的文件夹
def deleteFiles(dir, delete_dir):
    window_dir = os.path.join(dir, delete_dir)
    if os.path.exists(window_dir):
        shutil.rmtree(window_dir)

# 删除指定文件
def deleteFile(dir, delete_file):
    file_path = os.path.join(dir, delete_file)
    if os.path.exists(file_path):
        os.remove(file_path)

# 【新增】定义忽略规则：过滤 .map 文件、隐藏文件、node_modules 等
def get_ignore_patterns(path, names):
    ignored = []
    for name in names:
        # 过滤 Source Maps (.map)，这是减小体积的关键
        if name.endswith('.map'):
            ignored.append(name)
        # 过滤系统隐藏文件 (.DS_Store 等) 和 git 目录
        elif name.startswith('.') or name == '__pycache__':
            ignored.append(name)
        # 过滤 node_modules (双重保险)
        elif name == 'node_modules':
            ignored.append(name)
        # 过滤日志文件
        elif name.endswith('.log'):
            ignored.append(name)
    return ignored

# 通用的复制逻辑（合并了你原来的 moveDistFiles, movePublicFiles, moveFiles）
# 增加了过滤逻辑
def smart_copy(src_folder, target_folder):
    if not os.path.exists(src_folder):
        print(f"目录 {src_folder} 不存在")
        return

    # 强制先创建目标目录
    if os.path.exists(target_folder) and not os.path.isdir(target_folder):
        os.remove(target_folder)
    os.makedirs(target_folder, exist_ok=True)

    for item in os.listdir(src_folder):
        # 应用过滤规则到顶层文件
        if item.endswith('.map') or item.startswith('.') or item == 'node_modules' or item == '__pycache__':
            continue

        src_path = os.path.join(src_folder, item)
        dst_path = os.path.join(target_folder, item)
        
        print(f"  >> {src_path}")
        
        if os.path.isfile(src_path):
            shutil.copy(src_path, target_folder)
        elif os.path.isdir(src_path):
            # 关键：在递归复制文件夹时应用 ignore 规则
            shutil.copytree(src_path, dst_path, dirs_exist_ok=True, ignore=get_ignore_patterns)
        else:
            print(f"未知类型文件: {src_path}")

if __name__ == "__main__":
    runtime_dir = moveDist()
    print(f"目标运行目录: {runtime_dir}\n")

    # 1. 处理 main (apps/main/dist -> runtime/main)
    deleteFiles(runtime_dir, 'main')
    print(f"正在更新 main 文件夹...")
    main_target_dir = os.path.join(runtime_dir, 'main')
    smart_copy(os.path.join("apps", "main", "dist"), main_target_dir)
    print("main 文件夹更新完成\n")

    # 2. 处理 window (apps/window/dist -> runtime/window)
    deleteFiles(runtime_dir, 'window')
    print(f"正在更新 window 文件夹...")
    window_target_dir = os.path.join(runtime_dir, 'window')
    smart_copy(os.path.join("apps", "window", "dist"), window_target_dir)
    print("window 文件夹更新完成\n")

    # 3. 处理 preload (apps/backend/public -> runtime/)
    deleteFile(runtime_dir, 'preload.js')
    deleteFile(runtime_dir, 'window_preload.js')
    deleteFile(runtime_dir, 'fast_window_preload.js')
    print(f"正在更新 preload 相关文件...")
    smart_copy(os.path.join("apps", "backend", "public"), runtime_dir)
    print("preload 相关文件更新完成\n")

    # 4. 处理 fast_window (apps/fast-window -> runtime/fast_window)
    deleteFiles(runtime_dir, 'fast_window')
    print(f"正在更新 fast_window 文件夹...")
    fast_window_target_dir = os.path.join(runtime_dir, 'fast_window')
    smart_copy(os.path.join("apps", "fast-window"), fast_window_target_dir)
    print("fast_window 相关文件更新完成")

    # 5. 补充 .gitkeep 文件
    for dir in [main_target_dir, window_target_dir, fast_window_target_dir]:
        if not os.path.exists(os.path.join(dir, '.gitkeep')):
            open(os.path.join(dir, '.gitkeep'), 'w').close()
